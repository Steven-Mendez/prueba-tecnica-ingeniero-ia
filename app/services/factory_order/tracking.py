"""Aprender de los ciclos pasados: precisión del pronóstico y corrección aprendida.

Para cada ventana pasada cuyo horizonte ya está en los datos, se recalcula el pedido con lo que se sabía al corte
(validación histórica) y se compara la demanda proyectada con la que de verdad hubo. Con cada día de datos que
agrega el ETL se completan más ciclos, la medición se vuelve más fiable y la corrección por modelo se recalibra.

La «demanda real» es la demanda ajustada (venta + pérdidas por disponibilidad y sustituciones en los meses de
quiebre, S1.7) calculada con todos los datos; la venta registrada se muestra aparte porque en quiebre no la mide.
"""

from dataclasses import dataclass

import pandas as pd

from app.schemas.factory_order import Parameters
from app.services.factory_order.cleaning import ORDER_WINDOW_MONTHS
from app.services.factory_order.model import actual_outcome
from app.services.factory_order.source import LoadedDataset

MIN_HISTORY_MONTHS = 12
MIN_CYCLES_FOR_CORRECTION = 2
CORRECTION_BOUNDS = (0.75, 1.25)  # la corrección aprendida nunca mueve la demanda más de ±25 %


@dataclass(frozen=True)
class Backtest:
    cutoff: pd.Timestamp
    window_close: pd.Timestamp
    arrival: pd.Timestamp
    next_arrival: pd.Timestamp
    projected: pd.Series  # demanda del horizonte proyectada por modelo
    realized: pd.Series  # demanda ajustada real en el horizonte
    realized_sales: pd.Series  # venta registrada en el horizonte
    tool_order: pd.Series  # pedido que habría sugerido la herramienta
    actual_order: pd.Series | None  # pedido que de verdad se hizo


def cycle_cutoffs(dataset: LoadedDataset) -> list[pd.Timestamp]:
    """Cortes de ciclo: fin del mes previo a cada ventana, con al menos 12 meses de historia."""
    months = sorted(pd.to_datetime(dataset.base.inventory["Mes (cierre)"].unique()))
    return [
        c
        for i, c in enumerate(months)
        if i + 1 >= MIN_HISTORY_MONTHS and (c.month % 12) + 1 in ORDER_WINDOW_MONTHS
    ]


def prorate(monthly: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Suma de una serie mensual sobre [start, end), con los meses de los extremos prorrateados por días."""
    total = pd.Series(0.0, index=monthly.columns)
    if end <= start:
        return total
    days = pd.date_range(start, end - pd.Timedelta(days=1), freq="D")
    counts = pd.Series(1, index=days).groupby(days.to_period("M")).sum()
    for month, n in counts.items():
        if month in monthly.index:
            total += monthly.loc[month] * (n / month.days_in_month)
    return total


def backtests(dataset: LoadedDataset) -> list[Backtest]:
    """Ciclos pasados con el horizonte completo en los datos (en caché por versión de la fuente)."""
    from app.services.factory_order.calculation import resolve, run_order

    def compute() -> list[Backtest]:
        data_cutoff = dataset.base.data_cutoff
        _, full = dataset.view(data_cutoff)
        result = []
        for cutoff in cycle_cutoffs(dataset):
            if cutoff >= data_cutoff:
                continue
            p = Parameters(cutoff_date=cutoff.date())
            eff = resolve(dataset, p)
            run = run_order(eff, p)
            dates = run.dates
            if dates.next_arrival > data_cutoff + pd.Timedelta(days=1):
                continue  # el horizonte todavía no terminó
            actual_order, _ = actual_outcome(dataset.base, dates)
            result.append(
                Backtest(
                    cutoff=cutoff,
                    window_close=dates.window_close,
                    arrival=dates.arrival,
                    next_arrival=dates.next_arrival,
                    projected=run.order["Demanda del horizonte"],
                    realized=prorate(full.adjusted, dates.arrival, dates.next_arrival),
                    realized_sales=prorate(full.sales, dates.arrival, dates.next_arrival),
                    tool_order=run.order["Pedido"],
                    actual_order=actual_order,
                )
            )
        return result

    return dataset.cached("backtests", compute)


@dataclass(frozen=True)
class Correction:
    factors: pd.Series | None  # multiplicador por modelo; None si no hay ciclos suficientes
    cycles_used: int
    last_cycle: pd.Timestamp | None


def learned_correction(dataset: LoadedDataset, cutoff: pd.Timestamp) -> Correction:
    """Sesgo histórico por modelo (real / proyectado) con los ciclos cuyo horizonte terminó antes del corte.

    Solo usa ciclos ya cerrados a la fecha de corte, así que no mira el futuro: en una validación histórica se
    aplica la corrección que se habría conocido entonces.
    """
    used = [b for b in backtests(dataset) if b.next_arrival <= cutoff + pd.Timedelta(days=1)]
    if len(used) < MIN_CYCLES_FOR_CORRECTION:
        return Correction(None, len(used), used[-1].window_close if used else None)
    projected = sum(b.projected for b in used)
    realized = sum(b.realized for b in used)
    ratio = (realized / projected.where(projected > 0)).fillna(1.0).clip(*CORRECTION_BOUNDS)
    return Correction(ratio, len(used), used[-1].window_close)


def wape(projected: pd.Series, realized: pd.Series) -> float | None:
    denominator = float(realized.abs().sum())
    return float((realized - projected).abs().sum()) / denominator if denominator > 0 else None


def bias(projected: pd.Series, realized: pd.Series) -> float | None:
    total = float(projected.sum())
    return float(realized.sum()) / total - 1 if total > 0 else None


def _labels(window_close: pd.Timestamp, arrival: pd.Timestamp, next_arrival: pd.Timestamp) -> tuple[str, str]:
    from app.services.factory_order.explanation import MONTHS_ES, month_label

    horizon = f"{MONTHS_ES[arrival.month]} → {MONTHS_ES[next_arrival.month]} {next_arrival.year}"
    return month_label(window_close), horizon


def accuracy(dataset: LoadedDataset):
    """Precisión del pronóstico en los ciclos ya cerrados y corrección que se aprende de ellos."""
    from app.schemas import factory_order as s
    from app.services.factory_order.calculation import resolve
    from app.services.factory_order.model import cycle_dates

    tests = backtests(dataset)
    cycles = []
    for b in tests:
        window_label, horizon_label = _labels(b.window_close, b.arrival, b.next_arrival)
        cycles.append(
            s.AccuracyCycle(
                cutoff_date=b.cutoff.date(),
                window_close=b.window_close.date(),
                window_label=window_label,
                horizon_label=horizon_label,
                projected=float(b.projected.sum()),
                realized=float(b.realized.sum()),
                realized_sales=float(b.realized_sales.sum()),
                tool_order=int(b.tool_order.sum()),
                actual_order=int(b.actual_order.sum()) if b.actual_order is not None else None,
                wape=wape(b.projected, b.realized),
                bias=bias(b.projected, b.realized),
                models=[
                    s.ModelOutcome(
                        model=m,
                        projected=float(b.projected[m]),
                        realized=float(b.realized.get(m, 0.0)),
                        realized_sales=float(b.realized_sales.get(m, 0.0)),
                        tool_order=int(b.tool_order[m]),
                        actual_order=int(b.actual_order[m]) if b.actual_order is not None else None,
                    )
                    for m in b.projected.index
                ],
            )
        )

    correction = learned_correction(dataset, dataset.base.data_cutoff)
    models = []
    if tests:
        projected = sum(b.projected for b in tests)
        realized = sum(b.realized for b in tests)
        for m in projected.index:
            models.append(
                s.ModelAccuracy(
                    model=m,
                    projected=float(projected[m]),
                    realized=float(realized.get(m, 0.0)),
                    bias=bias(projected[[m]], realized[[m]]),
                    wape=float(sum(abs(b.realized.get(m, 0.0) - b.projected[m]) for b in tests))
                    / float(realized[m])
                    if realized.get(m, 0.0) > 0
                    else None,
                    correction=float(correction.factors[m]) if correction.factors is not None else None,
                )
            )

    # Próximo ciclo que se podrá medir: el de horizonte más cercano que todavía no terminó
    closed = {b.cutoff for b in tests}
    pending = []
    for cutoff in cycle_cutoffs(dataset):
        if cutoff in closed or cutoff > dataset.base.data_cutoff:
            continue
        eff = resolve(dataset, Parameters(cutoff_date=cutoff.date()))
        pending.append(cycle_dates(eff.cutoff, eff.window_close, eff.lead_time_days).next_arrival)

    all_projected = sum(b.projected for b in tests) if tests else pd.Series(dtype=float)
    all_realized = sum(b.realized for b in tests) if tests else pd.Series(dtype=float)
    return s.Accuracy(
        data_version=dataset.id,
        cycles=cycles,
        models=models,
        # Error absoluto de cada modelo en cada ciclo (no se compensan entre ciclos) sobre la demanda real total
        wape=(
            sum(float((b.realized - b.projected).abs().sum()) for b in tests) / float(all_realized.sum())
            if tests and all_realized.sum() > 0
            else None
        ),
        bias=bias(all_projected, all_realized) if tests else None,
        correction_cycles=correction.cycles_used,
        next_cycle_closes=min(pending).date() if pending else None,
    )
