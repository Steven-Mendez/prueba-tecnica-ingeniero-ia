"""Modelo de pedido a fábrica: puerto de `notebooks/caso1/02_pedido_fabrica.ipynb` (§2–§9).

Las funciones conservan los nombres y la lógica del notebook; lo que allá eran constantes globales
(`LATE_SHARE`, `END_OF_LIFE`, …) viaja en `ModelConfig`, y las reglas de fábrica se reciben como argumento para
que el planificador pueda cambiarlas. Las etiquetas de columna quedan en español porque son las del CSV que
exporta el notebook (`outputs/pedido_*_por_modelo.csv`) y el test dorado las compara una a una.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from statistics import NormalDist

import numpy as np
import pandas as pd

from app.services.factory_order.base import CleanBase
from app.services.factory_order.cleaning import ORDER_WINDOW_MONTHS, monthly_table

DAYS_PER_MONTH = 365.25 / 12
LATE_THRESHOLD_DAYS = 130  # una unidad es "tardía" si tarda más que esto en llegar (S1.8)
DEFAULT_LATE_DELAY_MONTHS = 1.0  # las unidades tardías llegan ~1 mes después
DEFAULT_DEMAND_WINDOW_MONTHS = 12  # meses de historia para estimar la demanda (S1.7)
DEFAULT_LEFTOVER_EXTRA_MONTHS = (
    3.0  # meses extra en patio de una unidad que sobra al final del horizonte (S1.9)
)
DEFAULT_LEFTOVER_DISCOUNT = 0.04  # descuento al que llega esa unidad (> 180 días, comunicado 2026-09-22)
END_OF_LIFE_DISCOUNT = 0.10  # descuento de liquidación de un modelo en su última ventana (S1.10)
HISTORY_MONTHS_SHOWN = 18  # meses de historia que se grafican por modelo


@dataclass(frozen=True)
class ModelConfig:
    """Supuestos S1.7–S1.10 que el notebook fija como constantes."""

    models: tuple[str, ...]
    late_share: float
    late_delay_months: float = DEFAULT_LATE_DELAY_MONTHS
    demand_window_months: int = DEFAULT_DEMAND_WINDOW_MONTHS
    leftover_extra_months: float = DEFAULT_LEFTOVER_EXTRA_MONTHS
    leftover_discount: float = DEFAULT_LEFTOVER_DISCOUNT
    end_of_life: Mapping[str, float] = field(default_factory=dict)


# §2 · Calendario del ciclo -----------------------------------------------------------------------------------


@dataclass(frozen=True)
class CycleDates:
    cutoff: pd.Timestamp
    window_close: pd.Timestamp
    arrival: pd.Timestamp
    next_window_close: pd.Timestamp
    next_arrival: pd.Timestamp

    @property
    def gap_months(self) -> float:
        return (self.arrival - self.cutoff).days / DAYS_PER_MONTH

    @property
    def horizon_months(self) -> float:
        return (self.next_arrival - self.arrival).days / DAYS_PER_MONTH


def last_business_day(ts: pd.Timestamp) -> pd.Timestamp:
    month = ts.to_period("M")
    return pd.bdate_range(month.start_time, month.end_time)[-1]


def next_window_close(cutoff: pd.Timestamp) -> pd.Timestamp:
    """Cierre de la primera ventana trimestral posterior al mes del corte (último día hábil del mes)."""
    month = cutoff.to_period("M") + 1
    while month.month not in ORDER_WINDOW_MONTHS:
        month += 1
    return last_business_day(month.start_time)


def cycle_dates(cutoff: pd.Timestamp, window_close: pd.Timestamp, lead_time_days: int) -> CycleDates:
    lead = pd.Timedelta(days=lead_time_days)
    next_close = last_business_day(window_close + pd.DateOffset(months=3))  # ventanas trimestrales
    return CycleDates(cutoff, window_close, window_close + lead, next_close, next_close + lead)


def observed_lead_time(orders: pd.DataFrame) -> tuple[int, float, int]:
    """Lead time mediano pedido → patio, fracción de unidades tardías y líneas usadas (02 celda 2)."""
    rec = orders[orders["Estado"] == "Recibido"]
    lead = (rec["Fecha de recepción"] - rec["Fecha pedido"]).dt.days
    if rec.empty:
        return 0, 0.0, 0
    late_share = float(rec.loc[lead > LATE_THRESHOLD_DAYS, "Unidades"].sum() / rec["Unidades"].sum())
    return int(lead.median()), late_share, len(rec)


# §3 · Demanda ajustada (S1.7) --------------------------------------------------------------------------------


@dataclass(frozen=True)
class DemandHistory:
    """Series mensuales por modelo; reemplaza al SimpleNamespace del notebook."""

    months: pd.PeriodIndex
    sales: pd.DataFrame
    stock: pd.DataFrame
    censored: pd.DataFrame
    lost: pd.DataFrame
    lost_in_stockout: pd.DataFrame
    subs_in: pd.DataFrame
    subs_out: pd.DataFrame
    pairs: pd.Series
    adjusted: pd.DataFrame

    def without_substitution(self) -> "DemandHistory":
        # Si fábrica adelanta a los modelos en quiebre, nadie recibe sustitución en el hueco (escenario de §9).
        # Solo se vacían los pares; la demanda ajustada histórica no cambia.
        return replace(self, pairs=pd.Series(dtype=float))


def demand_history(d: CleanBase, cutoff: pd.Timestamp) -> DemandHistory:
    # Series mensuales por modelo: venta, stock, censura y demanda ajustada
    models = d.models
    stock = monthly_table(d.inventory, "Modelo", "Unidades", models)
    months = stock.loc[: str(cutoff.to_period("M"))].index
    stock = stock.reindex(months, fill_value=0)
    sales = monthly_table(d.base_sales, "Modelo", "Unidades", models, months)
    stock_start = stock.shift(1).fillna(stock.iloc[0])
    censored = (stock_start == 0) | (stock == 0)

    leads = d.leads[~d.leads["special_fleet"]]
    lost = monthly_table(leads[leads["no_availability"]], "Modelo de interés", "Unidades", models, months)
    lost_in_stockout = lost.where(censored, 0)

    won_other = leads[(leads["Resultado"] == "Ganada") & leads["Modelo comprado (si difiere)"].notna()]
    subs_in = pd.DataFrame(0.0, index=months, columns=models)
    subs_out = subs_in.copy()
    pairs: dict[tuple[str, str], float] = {}  # (modelo de interés, comprado) → unidades en meses de quiebre
    for _, row in won_other.iterrows():
        m, wanted, bought = row["month"], row["Modelo de interés"], row["Modelo comprado (si difiere)"]
        if m in censored.index and wanted in models and bought in models and censored.at[m, wanted]:
            subs_in.at[m, wanted] += row["Unidades"]
            subs_out.at[m, bought] += row["Unidades"]
            pairs[(wanted, bought)] = pairs.get((wanted, bought), 0) + row["Unidades"]

    adjusted = sales + lost_in_stockout + subs_in - subs_out
    return DemandHistory(
        months=months,
        sales=sales,
        stock=stock,
        censored=censored,
        lost=lost,
        lost_in_stockout=lost_in_stockout,
        subs_in=subs_in,
        subs_out=subs_out,
        pairs=pd.Series(pairs, dtype=float),
        adjusted=adjusted,
    )


def demand_table(hist: DemandHistory, window: int) -> pd.DataFrame:
    last, sales, censored = (
        hist.adjusted.iloc[-window:],
        hist.sales.iloc[-window:],
        hist.censored.iloc[-window:],
    )
    return pd.DataFrame(
        {
            "Venta 12m": sales.sum(),
            "Meses en quiebre": censored.sum(),
            "Perdidas recuperables": hist.lost_in_stockout.iloc[-window:].sum(),
            "Sustitución neta": (hist.subs_in - hist.subs_out).iloc[-window:].sum(),
            "Demanda ajustada 12m": last.sum(),
            "Demanda mensual": last.mean(),
            "Desv. mensual": last.std(ddof=1),
            "Demanda mensual (solo meses con stock)": sales.where(~censored).mean().fillna(last.mean()),
        }
    )


# §4 · Estacionalidad -----------------------------------------------------------------------------------------


def seasonal_index(adjusted: pd.DataFrame) -> pd.Series:
    total = adjusted.sum(axis=1).to_frame("u")
    total["fy"] = np.where(total.index.month >= 10, total.index.year + 1, total.index.year)
    t = total[total.groupby("fy")["u"].transform("size") == 12].copy()  # solo años fiscales completos
    t["idx"] = t["u"] / t.groupby("fy")["u"].transform("mean")
    return t.groupby(t.index.month)["idx"].mean().reindex(range(1, 13)).fillna(1.0)


def seasonal_factor(index: pd.Series, start: pd.Timestamp, end: pd.Timestamp) -> float:
    # Promedio del índice sobre los días del intervalo [start, end)
    days = pd.date_range(start, end - pd.Timedelta(days=1), freq="D")
    return float(index.reindex(days.month).mean())


def deseasonalized_std(hist: DemandHistory, index: pd.Series, window: int) -> pd.Series:
    """Desviación mensual sin estacionalidad: la alternativa de S1.9 que prueba la sensibilidad (§9)."""
    last = hist.adjusted.iloc[-window:]
    return last.div(index.reindex(last.index.month).to_numpy(), axis=0).std(ddof=1)


# §5 · Posición al llegar el pedido (S1.8) --------------------------------------------------------------------


def substitution_inflow(hist: DemandHistory, index, gap_months: float, coverage: pd.Series) -> pd.Series:
    # Unidades que cada modelo receptor venderá en el hueco por sustitución, mientras su donante esté en cero:
    # tasa histórica por mes de quiebre del donante × meses de quiebre esperados del donante antes de la llegada
    inflow = pd.Series(0.0, index=index)
    censored_months = hist.censored.sum()
    for (donor, recv), units in hist.pairs.items():
        if donor in inflow.index and recv in inflow.index and censored_months[donor] > 0:
            rate = units / censored_months[donor]
            inflow[recv] += rate * max(0.0, gap_months - coverage[donor])
    return inflow


def position_table(
    d: CleanBase, demand: pd.DataFrame, dates: CycleDates, sf_gap: float, hist: DemandHistory
) -> pd.DataFrame:
    cutoff_month = dates.cutoff.to_period("M")
    stock = d.inventory[d.inventory["month"] == cutoff_month].groupby("Modelo")["Unidades"].sum()
    transit = d.orders[d.orders["Estado"] == "En tránsito"]
    eta = transit["Fecha estimada de llegada"]
    t = demand[["Demanda mensual"]].copy()
    t["Stock al corte"] = stock.reindex(t.index).fillna(0)
    t["En tránsito"] = (
        transit[eta <= dates.arrival].groupby("Modelo")["Unidades"].sum().reindex(t.index).fillna(0)
    )
    # Llega después que este pedido pero antes que el siguiente: se descuenta del pedido
    t["Tránsito en el horizonte"] = (
        transit[(eta > dates.arrival) & (eta <= dates.next_arrival)]
        .groupby("Modelo")["Unidades"]
        .sum()
        .reindex(t.index)
        .fillna(0)
    )
    t["Demanda hasta la llegada"] = t["Demanda mensual"] * dates.gap_months * sf_gap
    t["Meses de cobertura hoy"] = (t["Stock al corte"] + t["En tránsito"]) / (t["Demanda mensual"] * sf_gap)
    t["Sustitución entrante en el hueco"] = substitution_inflow(
        hist, t.index, dates.gap_months, t["Meses de cobertura hoy"]
    )
    t["Posición al llegar"] = (
        t["Stock al corte"]
        + t["En tránsito"]
        - t["Demanda hasta la llegada"]
        - t["Sustitución entrante en el hueco"]
    ).clip(lower=0)
    t["Venta no atendible en el hueco"] = (
        t["Demanda hasta la llegada"] - t["Stock al corte"] - t["En tránsito"]
    ).clip(lower=0)
    return t


@dataclass(frozen=True)
class GapDiagnosis:
    """Unidades que se pierden ya en el primer mes del hueco (02 celda 10)."""

    first_month: pd.Period
    first_month_loss: float
    zero_now: list[str]


def gap_diagnosis(d: CleanBase, position: pd.DataFrame, dates: CycleDates, index: pd.Series) -> GapDiagnosis:
    # Modelos en cero cuyo tránsito llega después del primer mes: esa demanda ya no la rescata ningún pedido
    first_month = (dates.cutoff + pd.Timedelta(days=1)).to_period("M")
    transit = d.orders[d.orders["Estado"] == "En tránsito"]
    transit_first_month = (
        transit[transit["Fecha estimada de llegada"].dt.to_period("M") == first_month]
        .groupby("Modelo")["Unidades"]
        .sum()
        .reindex(position.index)
        .fillna(0)
    )
    zero_now = (position["Stock al corte"] == 0) & (transit_first_month == 0)
    loss = float((position.loc[zero_now, "Demanda mensual"] * index[first_month.month]).sum())
    return GapDiagnosis(first_month, loss, zero_now.index[zero_now].tolist())


# §6 · Stock de seguridad (S1.9, S1.10) -----------------------------------------------------------------------


def critical_ratio(economics: pd.DataFrame, cfg: ModelConfig) -> pd.DataFrame:
    e = economics
    margin = e["Precio promedio (USD)"] * e["Margen bruto %"]
    discount = pd.Series({m: cfg.end_of_life.get(m, cfg.leftover_discount) for m in e.index})
    overstock = (
        cfg.leftover_extra_months * e["Costo financiero mensual por unidad (USD)"]
        + discount * e["Precio promedio (USD)"]
    )
    cr = (margin / (margin + overstock)).clip(1e-6, 1 - 1e-6)
    z = cr.map(lambda p: NormalDist().inv_cdf(float(p)))
    z[[m for m in cfg.end_of_life if m in z.index]] = (
        0.0  # S1.10: sin stock de seguridad en la última ventana
    )
    return pd.DataFrame(
        {
            "Margen por unidad (USD)": margin,
            "Costo de una unidad sobrante (USD)": overstock,
            "Nivel de servicio objetivo": cr,
            "z": z,
        }
    )


def safety_stock(
    demand: pd.DataFrame,
    econ: pd.DataFrame,
    dates: CycleDates,
    sf_horizon: float,
    cfg: ModelConfig,
    months: float | None = None,
    sigma: pd.Series | None = None,
) -> pd.Series:
    # months: meses de incertidumbre que cubre la seguridad (por defecto el horizonte); sigma: desviación mensual
    # alternativa (por defecto la de la demanda ajustada)
    eol = demand.index.isin(list(cfg.end_of_life))
    months = dates.horizon_months if months is None else months
    sigma = demand["Desv. mensual"] if sigma is None else sigma
    variability = econ["z"].reindex(demand.index) * sigma * np.sqrt(months)
    late_arrival = np.where(
        eol, 0.0, cfg.late_share * cfg.late_delay_months * demand["Demanda mensual"] * sf_horizon
    )
    return (variability + late_arrival).rename("Stock de seguridad")


# §7 · Pedido -------------------------------------------------------------------------------------------------


def round_to_rules(raw: float, min_order: int, lot: int, floor: bool = False) -> int:
    if raw <= 0:
        return 0
    if floor:
        q = int(np.floor(raw / lot)) * lot
        return q if q >= min_order else 0
    q = int(round(raw / lot)) * lot
    if q < min_order:
        return min_order if raw >= min_order / 2 else 0
    return q


def order_table(
    d: CleanBase,
    demand: pd.DataFrame,
    dates: CycleDates,
    sf_gap: float,
    sf_horizon: float,
    hist: DemandHistory,
    cfg: ModelConfig,
    rules: pd.DataFrame,
    ss_months: float | None = None,
    ss_sigma: pd.Series | None = None,
    manual_adjustment: pd.Series | None = None,
    forced_order: pd.Series | None = None,
) -> pd.DataFrame:
    """Encadena posición, seguridad y redondeo.

    `manual_adjustment` (unidades que se suman al pedido bruto antes de redondear) y `forced_order` (pedido final
    fijado a mano) son lo que el planificador agrega por lo que los datos no saben (§12 paso 4). Solo cuando
    se usan aparecen las columnas «Ajuste manual» y «Pedido forzado»; sin ellos la tabla es la del notebook.
    """
    econ = critical_ratio(d.economics, cfg)
    t = position_table(d, demand, dates, sf_gap, hist)
    t["Desv. mensual"] = demand["Desv. mensual"]
    t["Demanda del horizonte"] = t["Demanda mensual"] * dates.horizon_months * sf_horizon
    t["Nivel de servicio"] = econ["Nivel de servicio objetivo"]
    t["Stock de seguridad"] = safety_stock(demand, econ, dates, sf_horizon, cfg, ss_months, ss_sigma)
    t["Pedido bruto"] = (
        t["Demanda del horizonte"]
        + t["Stock de seguridad"]
        - t["Posición al llegar"]
        - t["Tránsito en el horizonte"]
    )
    t["Mínimo"] = rules["min_order"].reindex(t.index)
    t["Múltiplo"] = rules["lot_multiple"].reindex(t.index)
    adjustment = (
        pd.Series(0.0, index=t.index)
        if manual_adjustment is None
        else manual_adjustment.reindex(t.index).fillna(0)
    )
    to_round = t["Pedido bruto"] + adjustment
    t["Pedido"] = [
        round_to_rules(r, int(mn), int(lt), floor=m in cfg.end_of_life)
        for m, r, mn, lt in zip(t.index, to_round, t["Mínimo"], t["Múltiplo"], strict=True)
    ]
    if forced_order is not None and forced_order.notna().any():
        forced = forced_order.reindex(t.index)
        t["Pedido"] = forced.where(forced.notna(), t["Pedido"]).astype(int)
    t["Capital (USD)"] = t["Pedido"] * d.economics["Costo unitario promedio (USD)"].reindex(t.index)
    t["Cobertura tras el pedido (meses)"] = (t["Posición al llegar"] + t["Pedido"]) / (
        t["Demanda mensual"] * sf_horizon
    )
    if manual_adjustment is not None and (adjustment != 0).any():
        t["Ajuste manual"] = adjustment
    if forced_order is not None and forced_order.notna().any():
        t["Pedido forzado"] = forced_order.reindex(t.index)
    return t


def previous_window_order(d: CleanBase, dates: CycleDates) -> pd.Series:
    """Pedido de la ventana anterior (un trimestre antes del cierre), para comparar."""
    previous = dates.window_close - pd.DateOffset(months=3)
    return (
        d.orders[d.orders["order_quarter"] == previous.to_period("Q")]
        .groupby("Modelo")["Unidades"]
        .sum()
        .reindex(d.models)
        .fillna(0)
    )


def actual_outcome(base: CleanBase, dates: CycleDates) -> tuple[pd.Series | None, pd.Series | None]:
    """Validación histórica: pedido real de la ventana calculada y venta real del horizonte, si los datos llegan.

    Usa la base completa (no la vista al corte), porque es justamente lo que el corte no sabía.
    """
    if dates.cutoff >= base.data_cutoff:
        return None, None
    orders = base.orders[base.orders["order_quarter"] == dates.window_close.to_period("Q")]
    actual_order = (
        orders.groupby("Modelo")["Unidades"].sum().reindex(base.models).fillna(0)
        if not orders.empty
        else None
    )
    actual_sales = None
    if dates.next_arrival <= base.data_cutoff + pd.Timedelta(days=1):
        s = base.base_sales
        window = s[(s["Fecha"] >= dates.arrival) & (s["Fecha"] < dates.next_arrival)]
        actual_sales = window.groupby("Modelo")["Unidades"].sum().reindex(base.models).fillna(0)
    return actual_order, actual_sales


# §8 · Mezcla por versión -------------------------------------------------------------------------------------


def version_split(d: CleanBase, order: pd.DataFrame, dates: CycleDates, window: int) -> pd.DataFrame:
    start = dates.cutoff - pd.DateOffset(months=window)
    sales = d.base_sales[d.base_sales["Fecha"] > start].groupby(["Modelo", "Versión"])["Unidades"].sum()
    leads = d.leads[
        ~d.leads["special_fleet"] & d.leads["no_availability"] & (d.leads["Fecha cierre"] > start)
    ]
    lost = (
        leads.dropna(subset=["Versión de interés"])
        .groupby(["Modelo de interés", "Versión de interés"])["Unidades"]
        .sum()
    )
    lost.index.names = ["Modelo", "Versión"]
    v = pd.DataFrame({"Demanda 12m": sales.add(lost, fill_value=0)}).fillna(0)
    v["Stock al corte"] = (
        d.inventory[d.inventory["month"] == dates.cutoff.to_period("M")]
        .groupby(["Modelo", "Versión"])["Unidades"]
        .sum()
        .reindex(v.index)
        .fillna(0)
    )
    v["En tránsito"] = (
        d.orders[d.orders["Estado"] == "En tránsito"]
        .groupby(["Modelo", "Versión"])["Unidades"]
        .sum()
        .reindex(v.index)
        .fillna(0)
    )
    v["Necesidad hasta fin del horizonte"] = (
        v["Demanda 12m"] / window * (dates.gap_months + dates.horizon_months)
    )
    v["Faltante"] = (v["Necesidad hasta fin del horizonte"] - v["Stock al corte"] - v["En tránsito"]).clip(
        lower=0
    )
    v["Pedido"] = 0
    for model, q in order["Pedido"].items():
        if q <= 0 or model not in v.index.get_level_values(0):
            continue
        sub = v.loc[model]
        weights = sub["Faltante"] if sub["Faltante"].sum() > 0 else sub["Demanda 12m"]
        if weights.sum() <= 0:
            weights = pd.Series(1.0, index=sub.index)
        raw = q * weights / weights.sum()
        alloc = np.floor(raw).astype(int)
        for ver in (raw - alloc).sort_values(ascending=False).index[: int(q - alloc.sum())]:  # resto mayor
            alloc[ver] += 1
        v.loc[[(model, ver) for ver in alloc.index], "Pedido"] = alloc.values
    return v[v.index.get_level_values(0).isin(order.index[order["Pedido"] > 0])]


def covered_versions(versions: pd.DataFrame, window: int) -> pd.DataFrame:
    """Versiones sin pedido pese a pedirse el modelo: stock + tránsito ya cubren su demanda (02 celda 17)."""
    zero = versions[
        (versions["Pedido"] == 0) & (versions["Stock al corte"] + versions["En tránsito"] > 0)
    ].copy()
    zero["Demanda mensual"] = zero["Demanda 12m"] / window
    return zero


def aged_units(d: CleanBase, cutoff: pd.Timestamp, days: int = 180) -> pd.Series:
    """Unidades con más de `days` días en patio al corte, por modelo y versión (02 celda 26)."""
    inv = d.inventory
    mask = (inv["month"] == cutoff.to_period("M")) & (inv["age_days"] > days)
    return inv.loc[mask].groupby(["Modelo", "Versión"])["Unidades"].sum().sort_values(ascending=False)
