"""Orquesta un cálculo completo del pedido a partir de `Parameters` y lo convierte al esquema de la API.

Con el Excel del repo y los parámetros por defecto reproduce exactamente `02_pedido_fabrica` (tests/).
Cada escenario de sensibilidad es el cálculo actual con un solo supuesto cambiado, como en el §9 del notebook.
"""

import math
from dataclasses import dataclass, replace
from datetime import UTC, datetime

import pandas as pd

from app.config import get_settings
from app.schemas import factory_order as s
from app.services.factory_order import cleaning
from app.services.factory_order import explanation as ex
from app.services.factory_order.base import CleanBase, DataError
from app.services.factory_order.model import (
    DAYS_PER_MONTH,
    END_OF_LIFE_DISCOUNT,
    HISTORY_MONTHS_SHOWN,
    CycleDates,
    DemandHistory,
    ModelConfig,
    actual_outcome,
    aged_units,
    covered_versions,
    critical_ratio,
    cycle_dates,
    demand_table,
    deseasonalized_std,
    gap_diagnosis,
    last_business_day,
    next_window_close,
    observed_lead_time,
    order_table,
    previous_window_order,
    seasonal_factor,
    seasonal_index,
    version_split,
)
from app.services.factory_order.notebook_export import read_notebook_order
from app.services.factory_order.source import LoadedDataset

DEFAULT_COMMUNICATED_LEAD_MONTHS = 4.0  # comunicado 2024-02-12, si el Excel no lo trae
FUTURE_WINDOWS = 3  # ventanas siguientes que se pueden planificar con los datos actuales


@dataclass(frozen=True)
class Effective:
    """Parámetros resueltos contra los datos (los `None` reemplazados por lo que dicen los datos)."""

    dataset: LoadedDataset
    view: CleanBase
    hist: DemandHistory
    cutoff: pd.Timestamp
    window_close: pd.Timestamp
    lead_time_days: int
    late_share: float
    end_of_life: dict[str, float]
    rules: pd.DataFrame
    manual_adjustment: pd.Series | None
    forced_order: pd.Series | None
    derived: s.DerivedParameters
    warnings: list[str]
    window_kind: str = "current"
    pipeline: list[dict] = None  # planes guardados de ventanas intermedias, contados como tránsito
    missing_pipeline: list[str] = None  # ventanas intermedias sin plan guardado

    def config(self, p: s.Parameters) -> ModelConfig:
        return ModelConfig(
            models=tuple(self.view.models),
            late_share=self.late_share,
            late_delay_months=p.late_delay_months,
            demand_window_months=p.demand_window_months,
            leftover_extra_months=p.leftover_extra_months,
            leftover_discount=p.leftover_discount,
            end_of_life=self.end_of_life,
        )


@dataclass(frozen=True)
class OrderRun:
    dates: CycleDates
    demand: pd.DataFrame
    seasonal: pd.Series
    sf_gap: float
    sf_horizon: float
    order: pd.DataFrame
    config: ModelConfig


# Valores por defecto derivados de los datos ---------------------------------------------------------------------


def _available_cutoffs(base: CleanBase) -> list[pd.Timestamp]:
    return sorted(pd.to_datetime(base.inventory["Mes (cierre)"].unique()))


def _effective_rules(view: CleanBase) -> tuple[pd.DataFrame, list[str]]:
    rules = cleaning.parse_order_rules(view.communications)
    normalize = cleaning.make_model_normalizer(view.models)
    rules.index = rules.index.map(normalize)
    missing = [m for m in view.models if m not in rules.index]
    warnings = []
    if missing:
        warnings.append(
            f"Sin regla de fábrica al corte para {ex.join_es(missing)}: se usa mínimo 1 y múltiplo 1."
            if len(missing) < len(view.models)
            else "Sin comunicado de mínimos y múltiplos al corte: se usa mínimo 1 y múltiplo 1 en todos los modelos."
        )
    filler = pd.DataFrame({"min_order": 1, "lot_multiple": 1}, index=pd.Index(missing, name="Modelo"))
    full = pd.concat([rules[rules.index.isin(view.models)], filler]).reindex(view.models)
    return full.astype(int), warnings


def derive(
    dataset: LoadedDataset, cutoff: pd.Timestamp, window_close: pd.Timestamp | None = None
) -> tuple[s.DerivedParameters, list[str]]:
    view, _ = dataset.view(cutoff)
    warnings: list[str] = []
    window = window_close if window_close is not None else next_window_close(cutoff)
    lead, late, lines = observed_lead_time(view.orders)
    comm_months = (
        cleaning.communicated_lead_time_months(view.communications) or DEFAULT_COMMUNICATED_LEAD_MONTHS
    )
    comm_days = round(comm_months * DAYS_PER_MONTH)
    sources = {
        "cutoff_date": "Último inventario",
        "window_close": "Primera ventana tras el corte",
        "lead_time_days": f"Mediana de {lines} líneas recibidas",
        "late_share": "Más de 130 días",
        "communicated_lead_time_days": f"Comunicado de calendario: {comm_months:g} meses",
    }
    if lines == 0:
        lead, late = comm_days, 0.0
        sources["lead_time_days"] = "Sin pedidos recibidos: el del comunicado"
        warnings.append(
            "No hay pedidos recibidos al corte: se usa el lead time del comunicado y 0 % tardías."
        )
    eol_models = cleaning.detect_end_of_life(view.communications, view.models, window)
    sources["end_of_life"] = (
        "Comunicado de última ventana" if eol_models else "Sin comunicado de última ventana"
    )
    return (
        s.DerivedParameters(
            cutoff_date=cutoff.date(),
            window_close=window.date(),
            lead_time_days=lead,
            late_share=late,
            end_of_life={m: END_OF_LIFE_DISCOUNT for m in eol_models},
            communicated_lead_time_days=comm_days,
            sources=sources,
        ),
        warnings,
    )


def window_after(window_close: pd.Timestamp) -> pd.Timestamp:
    """Cierre de la ventana trimestral siguiente."""
    return last_business_day(window_close + pd.DateOffset(months=3))


def plan_summary(record: dict) -> s.PlanSummary:
    return s.PlanSummary(
        id=record["id"],
        name=record["name"],
        status=record["status"],
        window_close=record["window_close"],
        window_label=record["window_label"],
        arrival=record["arrival"],
        total_units=record["total_units"],
        capital_usd=record["capital_usd"],
        created_at=record["created_at"],
    )


def _pipeline(
    cutoff: pd.Timestamp, window_close: pd.Timestamp, plans: list[dict] | None
) -> tuple[list[dict], list[str]]:
    """Planes guardados de las ventanas entre el corte y la ventana planificada, y las ventanas sin plan.

    Al planificar una ventana futura (p. ej. enero con datos a septiembre) el pedido de octubre todavía no está en
    la hoja *Pedidos*, pero sí llegará antes: el plan guardado de octubre cuenta como tránsito. Por ventana se
    toma el plan marcado como enviado o, si no lo hay, el más reciente.
    """
    used: list[dict] = []
    missing: list[str] = []
    window = next_window_close(cutoff)
    while window < window_close:
        candidates = [r for r in plans or [] if pd.Timestamp(r["window_close"]) == window]
        sent = [r for r in candidates if r.get("status") == "sent"]
        pool = sent or candidates
        if pool:
            used.append(max(pool, key=lambda r: r["created_at"]))
        else:
            missing.append(ex.month_label(window))
        window = window_after(window)
    return used, missing


def _pipeline_orders(view: CleanBase, plans: list[dict]) -> pd.DataFrame:
    """Filas de pedido «En tránsito» a partir de los planes guardados, con las columnas de la hoja *Pedidos*."""
    rows = []
    for r in plans:
        ordered = pd.Timestamp(r["window_close"])
        arrival = pd.Timestamp(r["arrival"])
        versions = [v for v in r.get("versions", []) if v["order"] > 0]
        lines = (
            [(v["model"], v["version"], v["order"]) for v in versions]
            if versions
            else [(x["model"], None, x["order"]) for x in r["rows"] if x["order"] > 0]
        )
        for model, version, units in lines:
            rows.append(
                {
                    "Modelo": model,
                    "Versión": version,
                    "Unidades": units,
                    "Estado": "En tránsito",
                    "Fecha pedido": ordered,
                    "Fecha estimada de llegada": arrival,
                    "Fecha de recepción": pd.NaT,
                    "order_month": ordered.to_period("M"),
                    "order_quarter": ordered.to_period("Q"),
                    "in_order_window": True,
                    "plan_id": r["id"],
                }
            )
    synthetic = pd.DataFrame(rows)
    return pd.concat([view.orders, synthetic], ignore_index=True) if rows else view.orders


def resolve(dataset: LoadedDataset, p: s.Parameters, plans: list[dict] | None = None) -> Effective:
    base = dataset.base
    warnings: list[str] = []
    available = _available_cutoffs(base)
    cutoff = pd.Timestamp(p.cutoff_date) if p.cutoff_date else base.data_cutoff
    if cutoff not in available:
        raise DataError(
            f"La fecha de corte debe ser un fin de mes con foto de inventario (entre {ex.fmt_date(available[0])} "
            f"y {ex.fmt_date(available[-1])})."
        )
    months = sum(1 for c in available if c <= cutoff)
    if months < p.demand_window_months:
        raise DataError(
            f"Con corte al {ex.fmt_date(cutoff)} hay {months} meses de historia; la ventana de demanda pide "
            f"{p.demand_window_months}."
        )
    window_close = pd.Timestamp(p.window_close) if p.window_close else None
    derived, derive_warnings = derive(dataset, cutoff, window_close)
    warnings += derive_warnings
    window_close = pd.Timestamp(derived.window_close)
    if window_close.month not in cleaning.ORDER_WINDOW_MONTHS:
        warnings.append(
            f"El cierre {ex.fmt_date(window_close)} no cae en un mes de ventana (enero, abril, julio u octubre)."
        )
    if cutoff < base.data_cutoff:
        warnings.append(
            f"Validación histórica: se usa solo lo que se sabía al {ex.fmt_date(cutoff)} (ventas, leads, pedidos, "
            "comunicados e inventario hasta esa fecha)."
        )
    window_kind = (
        "past"
        if cutoff < base.data_cutoff
        else "future"
        if window_close > next_window_close(cutoff)
        else "current"
    )

    view, hist = dataset.view(cutoff)
    pipeline, missing_pipeline = (
        _pipeline(cutoff, window_close, plans) if window_kind == "future" else ([], [])
    )
    if pipeline:
        view = replace(view, orders=_pipeline_orders(view, pipeline))
    for label in missing_pipeline:
        warnings.append(
            f"Sin plan guardado para la ventana {label}: el cálculo asume que en ella no se pide nada. "
            "Guarda primero ese pedido para que cuente como tránsito."
        )
    models = view.models
    unknown = sorted(set(p.overrides) - set(models)) + sorted(set(p.end_of_life or {}) - set(models))
    if unknown:
        raise DataError(f"Modelos desconocidos: {', '.join(unknown)}. El catálogo es: {', '.join(models)}.")

    rules, rule_warnings = _effective_rules(view)
    warnings += rule_warnings
    adjustments = pd.Series(0.0, index=models)
    forced = pd.Series(float("nan"), index=models)
    for m, o in p.overrides.items():
        if o.rule is not None:
            rules.loc[m] = [o.rule.min_order, o.rule.lot_multiple]
        adjustments[m] = o.manual_adjustment
        if o.forced_order is not None:
            forced[m] = o.forced_order

    return Effective(
        dataset=dataset,
        view=view,
        hist=hist,
        cutoff=cutoff,
        window_close=window_close,
        lead_time_days=p.lead_time_days if p.lead_time_days is not None else derived.lead_time_days,
        late_share=p.late_share if p.late_share is not None else derived.late_share,
        end_of_life=dict(p.end_of_life) if p.end_of_life is not None else dict(derived.end_of_life),
        rules=rules.astype(int),
        manual_adjustment=adjustments if (adjustments != 0).any() else None,
        forced_order=forced if forced.notna().any() else None,
        derived=derived,
        warnings=warnings,
        window_kind=window_kind,
        pipeline=pipeline,
        missing_pipeline=missing_pipeline,
    )


# Cálculo -----------------------------------------------------------------------------------------------------------


def run_order(eff: Effective, p: s.Parameters, lead_time_days: int | None = None) -> OrderRun:
    cfg = eff.config(p)
    dates = cycle_dates(eff.cutoff, eff.window_close, lead_time_days or eff.lead_time_days)
    demand = demand_table(eff.hist, p.demand_window_months)
    if p.demand_in_stock_months_only:
        demand["Demanda mensual"] = demand["Demanda mensual (solo meses con stock)"]
    demand["Demanda mensual"] *= p.demand_multiplier
    if p.learned_correction:
        from app.services.factory_order.tracking import learned_correction

        correction = learned_correction(eff.dataset, eff.cutoff)
        if correction.factors is not None:
            demand["Demanda mensual"] *= correction.factors.reindex(demand.index).fillna(1.0)
    index = seasonal_index(eff.hist.adjusted)
    sf_gap = seasonal_factor(index, dates.cutoff + pd.Timedelta(days=1), dates.arrival)
    sf_horizon = seasonal_factor(index, dates.arrival, dates.next_arrival)
    hist = eff.hist if p.substitution_in_gap else eff.hist.without_substitution()
    ss_months = dates.gap_months + dates.horizon_months if p.safety_months == "gap_plus_horizon" else None
    ss_sigma = (
        deseasonalized_std(eff.hist, index, p.demand_window_months)
        if p.safety_sigma == "deseasonalized"
        else None
    )
    order = order_table(
        eff.view,
        demand,
        dates,
        sf_gap,
        sf_horizon,
        hist,
        cfg,
        eff.rules,
        ss_months,
        ss_sigma,
        eff.manual_adjustment,
        eff.forced_order,
    )
    return OrderRun(dates, demand, index, sf_gap, sf_horizon, order, cfg)


def _scenarios(eff: Effective, p: s.Parameters, current: OrderRun) -> list[tuple[str, str, str, pd.Series]]:
    comm = eff.derived.communicated_lead_time_days
    variants: list[tuple[str, str, str, dict, int | None]] = [
        (
            "in_stock_mean",
            "Demanda = promedio de meses con stock",
            "Sin recuperar leads perdidos ni sustituciones: solo la venta de los meses con stock.",
            {"demand_in_stock_months_only": True},
            None,
        ),
        (
            "demand_minus_20",
            "Demanda −20 %",
            "La demanda mensual de todos los modelos, 20 % menor.",
            {"demand_multiplier": p.demand_multiplier * 0.8},
            None,
        ),
        (
            "demand_plus_20",
            "Demanda +20 %",
            "La demanda mensual de todos los modelos, 20 % mayor.",
            {"demand_multiplier": p.demand_multiplier * 1.2},
            None,
        ),
        (
            "communicated_lead_time",
            f"Lead time del comunicado ({comm} d)",
            "El tiempo estándar del comunicado de fábrica en lugar del observado.",
            {},
            comm,
        ),
        (
            "no_substitution",
            "Sin sustitución en el hueco",
            "Si fábrica adelanta a los modelos en quiebre, nadie recibe sus clientes mientras tanto.",
            {"substitution_in_gap": False},
            None,
        ),
        (
            "safety_gap_horizon",
            "Seguridad sobre hueco + horizonte",
            "La incertidumbre se mide desde el corte y no solo en el horizonte.",
            {"safety_months": "gap_plus_horizon"},
            None,
        ),
        (
            "deseasonalized_std",
            "Desv. sin estacionalidad",
            "La desviación mensual sin el efecto estacional.",
            {"safety_sigma": "deseasonalized"},
            None,
        ),
        (
            "both_s19",
            "Ambos ajustes de la seguridad",
            "Seguridad sobre hueco + horizonte y desviación sin estacionalidad.",
            {"safety_months": "gap_plus_horizon", "safety_sigma": "deseasonalized"},
            None,
        ),
    ]
    result = [
        ("current", "Parámetros actuales", "El pedido con los parámetros del panel.", current.order["Pedido"])
    ]
    for key, name, description, update, lead in variants:
        run = run_order(eff, p.model_copy(update=update), lead_time_days=lead)
        result.append((key, name, description, run.order["Pedido"]))
    return result


def _num(x) -> float | None:
    if x is None or pd.isna(x):
        return None
    x = float(x)
    return None if math.isinf(x) else x


def _months_between(start: pd.Timestamp, end: pd.Timestamp) -> set[int]:
    if end <= start:
        return set()
    return set(pd.date_range(start, end - pd.Timedelta(days=1), freq="D").month)


def _defaults_used(eff: Effective, p: s.Parameters) -> bool:
    d = s.Parameters()
    same_fields = all(
        getattr(p, f) == getattr(d, f)
        for f in s.Parameters.model_fields
        if f
        not in {"cutoff_date", "window_close", "lead_time_days", "late_share", "end_of_life", "overrides"}
    )
    derived = eff.derived
    return (
        same_fields
        and not p.overrides
        and eff.cutoff == eff.dataset.base.data_cutoff
        and eff.window_close == pd.Timestamp(next_window_close(eff.cutoff))
        and eff.lead_time_days == derived.lead_time_days
        and math.isclose(eff.late_share, derived.late_share)
        and eff.end_of_life == derived.end_of_life
    )


def _notebook_check(eff: Effective, p: s.Parameters, order: pd.DataFrame) -> s.NotebookCheck | None:
    # Solo tiene sentido con la ventana que calculó el notebook y los valores por defecto
    settings = get_settings()
    if f"_{eff.window_close:%Y-%m}_" not in settings.notebook_order_csv.name or not _defaults_used(eff, p):
        return None
    try:
        notebook = read_notebook_order(settings.resolve(settings.notebook_order_csv))
    except FileNotFoundError:
        return None
    nb = {m.model: m.order for m in notebook.models}
    differences = [
        s.NotebookDifference(model=m, notebook=nb.get(m, 0), tool=int(q))
        for m, q in order["Pedido"].items()
        if nb.get(m, 0) != int(q)
    ]
    return s.NotebookCheck(
        file=notebook.file,
        matches=not differences and math.isclose(notebook.capital_usd, float(order["Capital (USD)"].sum())),
        notebook_total_units=notebook.total_units,
        notebook_capital_usd=notebook.capital_usd,
        differences=differences,
    )


def _correction_info(dataset: LoadedDataset, eff: Effective, p: s.Parameters) -> s.CorrectionInfo:
    from app.services.factory_order.tracking import learned_correction

    correction = learned_correction(dataset, eff.cutoff)
    available = correction.factors is not None
    return s.CorrectionInfo(
        available=available,
        applied=available and p.learned_correction,
        cycles_used=correction.cycles_used,
        last_window_label=ex.month_label(correction.last_cycle)
        if correction.last_cycle is not None
        else None,
        factors={m: float(v) for m, v in correction.factors.items()} if available else {},
    )


def _baseline(
    dataset: LoadedDataset, p: s.Parameters, unit_cost: pd.Series, plans: list[dict] | None
) -> s.Baseline | None:
    # Mismo corte y cierre, todo lo demás por defecto: así el impacto mide solo los supuestos que se movieron
    reference = s.Parameters(cutoff_date=p.cutoff_date, window_close=p.window_close)
    if reference == p:
        return None
    orders = run_order(resolve(dataset, reference, plans), reference).order["Pedido"]
    return s.Baseline(
        orders={m: int(q) for m, q in orders.items()},
        total_units=int(orders.sum()),
        capital_usd=float((orders * unit_cost.reindex(orders.index)).sum()),
    )


def calculate(
    dataset: LoadedDataset, p: s.Parameters, plans: list[dict] | None = None
) -> s.CalculationResult:
    """`plans`: los planes guardados; cuentan como tránsito al planificar ventanas futuras."""
    eff = resolve(dataset, p, plans)
    run = run_order(eff, p)
    o, dates, cfg = run.order, run.dates, run.config
    window = p.demand_window_months
    economics = critical_ratio(eff.view.economics, cfg)
    previous = previous_window_order(eff.view, dates)
    actual_order, actual_sales = actual_outcome(dataset.base, dates)
    versions = version_split(eff.view, o, dates, window)
    covered = covered_versions(versions, window)
    aged = aged_units(eff.view, eff.cutoff)
    gap = gap_diagnosis(eff.view, o, dates, run.seasonal)
    scenarios = _scenarios(eff, p, run)
    explanations = ex.explain_orders(o, eff.end_of_life)
    warnings = list(eff.warnings) + [e.rule_warning for e in explanations if e.rule_warning]
    unit_cost = eff.view.economics["Costo unitario promedio (USD)"]

    adjustment_vs_sales = (run.demand["Demanda ajustada 12m"] / run.demand["Venta 12m"] - 1).where(
        run.demand["Venta 12m"] > 0
    )
    computed = {e.model: e.computed_order for e in explanations}
    order_rows = []
    for m in o["Pedido"].sort_values(ascending=False, kind="stable").index:
        r = o.loc[m]
        order_rows.append(
            s.OrderRow(
                model=m,
                monthly_demand=float(r["Demanda mensual"]),
                stock_at_cutoff=float(r["Stock al corte"]),
                in_transit=float(r["En tránsito"]),
                transit_in_horizon=float(r["Tránsito en el horizonte"]),
                demand_until_arrival=float(r["Demanda hasta la llegada"]),
                coverage_today_months=_num(r["Meses de cobertura hoy"]),
                substitution_inflow=float(r["Sustitución entrante en el hueco"]),
                position_at_arrival=float(r["Posición al llegar"]),
                unmet_gap_demand=float(r["Venta no atendible en el hueco"]),
                monthly_std=_num(r["Desv. mensual"]),
                horizon_demand=float(r["Demanda del horizonte"]),
                service_level=float(r["Nivel de servicio"]),
                safety_stock=float(r["Stock de seguridad"]),
                gross_order=float(r["Pedido bruto"]),
                manual_adjustment=float(r.get("Ajuste manual", 0) or 0),
                min_order=int(r["Mínimo"]),
                lot_multiple=int(r["Múltiplo"]),
                order=int(r["Pedido"]),
                computed_order=computed[m],
                forced_order=None
                if pd.isna(r.get("Pedido forzado", float("nan")))
                else int(r["Pedido forzado"]),
                capital_usd=float(r["Capital (USD)"]),
                coverage_after_order_months=_num(r["Cobertura tras el pedido (meses)"]),
                previous_window_order=int(previous[m]),
                actual_window_order=None if actual_order is None else int(actual_order[m]),
                actual_horizon_sales=None if actual_sales is None else float(actual_sales[m]),
                end_of_life=m in eff.end_of_life,
            )
        )

    scenario_rows = []
    for key, name, description, orders in scenarios:
        scenario_rows.append(
            s.Scenario(
                key=key,
                name=name,
                description=description,
                orders={m: int(q) for m, q in orders.items()},
                total_units=int(orders.sum()),
                capital_usd=float((orders * unit_cost.reindex(orders.index)).sum()),
                same_as_current=bool((orders == o["Pedido"]).all()),
            )
        )
    totals = [sc.total_units for sc in scenario_rows]
    by_key = {k: q for k, _, _, q in scenarios}
    spread = (by_key["demand_plus_20"] - by_key["demand_minus_20"]).abs()

    shown = eff.hist.months[-HISTORY_MONTHS_SHOWN:]
    history = []
    for m in eff.view.models:
        points = [
            s.HistoryPoint(
                month=str(month),
                sales=float(eff.hist.sales.at[month, m]),
                recovered_demand=float(eff.hist.adjusted.at[month, m] - eff.hist.sales.at[month, m]),
                adjusted_demand=float(eff.hist.adjusted.at[month, m]),
                stock_end=float(eff.hist.stock.at[month, m]),
                stockout=bool(eff.hist.censored.at[month, m]),
                lost_no_availability=float(eff.hist.lost.at[month, m]),
            )
            for month in shown
        ]
        history.append(
            s.ModelHistory(
                model=m,
                stockout_months=int(eff.hist.censored.loc[shown, m].sum()),
                adjustment_vs_sales=_num(adjustment_vs_sales[m]),
                points=points,
            )
        )

    gap_months = _months_between(dates.cutoff + pd.Timedelta(days=1), dates.arrival)
    horizon_months = _months_between(dates.arrival, dates.next_arrival)

    return s.CalculationResult(
        data_version=dataset.id,
        calculated_at=datetime.now(UTC),
        parameters=p,
        derived=eff.derived,
        calendar=s.Calendar(
            cutoff_date=dates.cutoff.date(),
            window_close=dates.window_close.date(),
            arrival=dates.arrival.date(),
            next_window_close=dates.next_window_close.date(),
            next_arrival=dates.next_arrival.date(),
            lead_time_days=(dates.arrival - dates.window_close).days,
            gap_months=dates.gap_months,
            horizon_months=dates.horizon_months,
            gap_seasonal_factor=run.sf_gap,
            horizon_seasonal_factor=run.sf_horizon,
            window_label=ex.month_label(dates.window_close),
            previous_window_label=ex.month_label(dates.window_close - pd.DateOffset(months=3)),
            horizon_label=(
                f"{ex.MONTHS_ES[dates.arrival.month]} → {ex.MONTHS_ES[dates.next_arrival.month]} "
                f"{dates.next_arrival.year}"
            ),
            first_gap_month_label=ex.month_label(gap.first_month),
        ),
        kpis=s.Kpis(
            total_units=int(o["Pedido"].sum()),
            capital_usd=float(o["Capital (USD)"].sum()),
            previous_window_units=int(previous.sum()),
            models_with_order=int((o["Pedido"] > 0).sum()),
            models_total=len(o),
            zero_order_models=o.index[o["Pedido"] == 0].tolist(),
            unmet_gap_demand=float(o["Venta no atendible en el hueco"].sum()),
            gap_substitution_inflow=float(o["Sustitución entrante en el hueco"].sum()),
            first_month_loss=gap.first_month_loss,
            units_over_180_days=int(aged.sum()),
            total_safety_stock=float(o["Stock de seguridad"].sum()),
            actual_window_units=None if actual_order is None else int(actual_order.sum()),
            actual_horizon_sales=None if actual_sales is None else float(actual_sales.sum()),
            horizon_demand_total=float(o["Demanda del horizonte"].sum()),
        ),
        demand=[
            s.DemandRow(
                model=m,
                sales_window=float(r["Venta 12m"]),
                stockout_months=int(r["Meses en quiebre"]),
                recoverable_lost=float(r["Perdidas recuperables"]),
                net_substitution=float(r["Sustitución neta"]),
                adjusted_demand_window=float(r["Demanda ajustada 12m"]),
                monthly_demand=float(r["Demanda mensual"]),
                monthly_std=_num(r["Desv. mensual"]),
                monthly_demand_in_stock_only=_num(r["Demanda mensual (solo meses con stock)"]),
                adjustment_vs_sales=_num(adjustment_vs_sales[m]),
            )
            for m, r in run.demand.iterrows()
        ],
        economics=[
            s.EconomicsRow(
                model=m,
                unit_margin_usd=float(r["Margen por unidad (USD)"]),
                overstock_cost_usd=float(r["Costo de una unidad sobrante (USD)"]),
                service_level=float(r["Nivel de servicio objetivo"]),
                z=float(r["z"]),
                end_of_life_discount=eff.end_of_life.get(m),
            )
            for m, r in economics.iterrows()
        ],
        order=order_rows,
        explanations=[s.Explanation(model=e.model, case=e.case, text=e.text) for e in explanations],
        versions=[
            s.VersionRow(
                model=m,
                version=v,
                demand_window=float(r["Demanda 12m"]),
                stock_at_cutoff=float(r["Stock al corte"]),
                in_transit=float(r["En tránsito"]),
                need_until_horizon_end=float(r["Necesidad hasta fin del horizonte"]),
                shortfall=float(r["Faltante"]),
                order=int(r["Pedido"]),
            )
            for (m, v), r in versions.iterrows()
        ],
        covered_versions=[
            s.CoveredVersion(
                model=m,
                version=v,
                stock_at_cutoff=float(r["Stock al corte"]),
                in_transit=float(r["En tránsito"]),
                monthly_demand=float(r["Demanda mensual"]),
            )
            for (m, v), r in covered.iterrows()
        ],
        sensitivity=s.Sensitivity(
            scenarios=scenario_rows,
            total_min=min(totals),
            total_max=max(totals),
            most_sensitive_model=str(spread.idxmax()) if spread.max() > 0 else None,
        ),
        history=history,
        seasonality=[
            s.SeasonalityPoint(
                month=int(month),
                label=ex.MONTHS_ES[int(month)],
                index=float(value),
                in_gap=int(month) in gap_months,
                in_horizon=int(month) in horizon_months,
            )
            for month, value in run.seasonal.items()
        ],
        substitutions=[
            s.SubstitutionPair(wanted_model=w, bought_model=b, units=float(u))
            for (w, b), u in eff.hist.pairs.sort_values(ascending=False).items()
        ],
        warnings=warnings,
        correction=_correction_info(dataset, eff, p),
        window_kind=eff.window_kind,
        window_plans=[
            plan_summary(r)
            for r in sorted(plans or [], key=lambda r: r["created_at"], reverse=True)
            if pd.Timestamp(r["window_close"]) == eff.window_close
        ],
        pipeline=[plan_summary(r) for r in eff.pipeline],
        missing_pipeline_windows=list(eff.missing_pipeline),
        baseline=_baseline(dataset, p, unit_cost, plans),
        notebook_check=_notebook_check(eff, p, o),
    )


# Exportación y valores por defecto ---------------------------------------------------------------------------------


def export_csv(
    dataset: LoadedDataset, p: s.Parameters, table: str, plans: list[dict] | None = None
) -> tuple[str, str]:
    """Mismos CSV que exporta el notebook (§11); con los parámetros por defecto son idénticos byte a byte."""
    eff = resolve(dataset, p, plans)
    run = run_order(eff, p)
    label = f"{run.dates.window_close:%Y-%m}"
    if table == "model":
        return f"pedido_{label}_por_modelo.csv", run.order.round(2).to_csv()
    versions = version_split(eff.view, run.order, run.dates, p.demand_window_months)
    return f"pedido_{label}_por_version.csv", versions.round(2).to_csv()


def parameter_defaults(dataset: LoadedDataset) -> s.ParameterDefaults:
    base = dataset.base
    cutoff = base.data_cutoff
    derived, _ = derive(dataset, cutoff)
    view, _ = dataset.view(cutoff)
    rules, _ = _effective_rules(view)
    available = _available_cutoffs(base)
    min_months = s.Parameters().demand_window_months
    options = []
    for i, c in enumerate(available):
        # Cortes de ciclo: el fin de mes previo a cada ventana (y el corte de los datos), con historia suficiente
        is_cycle_cutoff = (c.month % 12) + 1 in cleaning.ORDER_WINDOW_MONTHS
        if i + 1 < min_months or not (is_cycle_cutoff or c == cutoff):
            continue
        window = next_window_close(c)
        options.append(
            s.CutoffOption(
                cutoff_date=c.date(),
                window_close=window.date(),
                label=f"{ex.fmt_date(c)} · ventana {ex.month_label(window)}",
                kind="current" if c == cutoff else "past",
            )
        )
    # Ventanas siguientes: se planifican con los mismos datos; los planes guardados intermedios cuentan como tránsito
    window = next_window_close(cutoff)
    future = []
    for _ in range(FUTURE_WINDOWS):
        window = window_after(window)
        future.append(
            s.CutoffOption(
                cutoff_date=cutoff.date(),
                window_close=window.date(),
                label=f"ventana {ex.month_label(window)} · con datos al {ex.fmt_date(cutoff)}",
                kind="future",
            )
        )
    versions = (
        pd.concat([base.inventory[["Modelo", "Versión"]], base.base_sales[["Modelo", "Versión"]]])
        .dropna()
        .drop_duplicates()
        .sort_values(["Modelo", "Versión"])
    )
    return s.ParameterDefaults(
        parameters=s.Parameters(),
        derived=derived,
        catalog=s.Catalog(
            models=base.models,
            rules={
                m: s.LotRule(min_order=int(r["min_order"]), lot_multiple=int(r["lot_multiple"]))
                for m, r in rules.iterrows()
            },
            unit_cost_usd={m: float(c) for m, c in base.economics["Costo unitario promedio (USD)"].items()},
            versions_by_model={m: g["Versión"].tolist() for m, g in versions.groupby("Modelo")},
        ),
        cutoff_options=list(reversed(options)) + future,
    )
