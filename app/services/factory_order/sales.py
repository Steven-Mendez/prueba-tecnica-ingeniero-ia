"""Tablero de ventas: la hoja Ventas ya limpia (duplicados fuera, nombres normalizados, precios en USD)."""

from datetime import date

import pandas as pd

from app.schemas import sales as s
from app.services.factory_order.source import LoadedDataset

TOP_N = 12


def _between(dates: pd.Series, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Fechas dentro de [start, end] por día, incluyendo todo el último día."""
    return (dates >= start) & (dates < end + pd.Timedelta(days=1))


def _filter(df: pd.DataFrame, models, branches, customer_types, branch_col="Sucursal", model_col="Modelo"):
    mask = pd.Series(True, index=df.index)
    if models:
        mask &= df[model_col].isin(models)
    if branches:
        mask &= df[branch_col].isin(branches)
    if customer_types:
        mask &= df["Tipo de cliente"].isin(customer_types)
    return df[mask]


def _groups(current: pd.DataFrame, previous: pd.DataFrame | None, by: list[str], top: int | None = None):
    total = float(current["Unidades"].sum()) or 1.0
    grouped = current.groupby(by, dropna=False).agg(units=("Unidades", "sum"), revenue=("revenue", "sum"))
    grouped = grouped.sort_values("units", ascending=False)
    if top:
        grouped = grouped.head(top)
    prev = previous.groupby(by, dropna=False)["Unidades"].sum() if previous is not None else None
    result = []
    for key, row in grouped.iterrows():
        parts = key if isinstance(key, tuple) else (key,)
        label = " · ".join(str(p) for p in parts if pd.notna(p)) or "Sin dato"
        result.append(
            s.SalesGroup(
                key=label,
                label=label,
                units=int(row["units"]),
                revenue_usd=float(row["revenue"]),
                share=float(row["units"]) / total,
                units_prev_year=int(prev.get(key, 0)) if prev is not None else None,
            )
        )
    return result


def overview(
    dataset: LoadedDataset,
    date_from: date | None = None,
    date_to: date | None = None,
    models: list[str] | None = None,
    branches: list[str] | None = None,
    customer_types: list[str] | None = None,
    include_fleet: bool = False,
) -> s.SalesOverview:
    base = dataset.base
    sales = base.sales.assign(revenue=lambda d: d["Unidades"] * d["price_usd_converted"])
    leads = base.leads
    min_date, max_date = sales["Fecha"].min(), sales["Fecha"].max()
    end = pd.Timestamp(date_to) if date_to else max_date.normalize()
    start = (
        pd.Timestamp(date_from)
        if date_from
        else (end - pd.DateOffset(months=12) + pd.Timedelta(days=1)).normalize()
    )
    if start > end:
        start, end = end, start
    models, branches, customer_types = models or [], branches or [], customer_types or []

    pool = sales if include_fleet else sales[~sales["special_fleet"]]
    pool = _filter(pool, models, branches, customer_types)
    current = pool[_between(pool["Fecha"], start, end)]
    prev_start, prev_end = start - pd.DateOffset(years=1), end - pd.DateOffset(years=1)
    has_prev = prev_start >= min_date.normalize()
    previous = pool[_between(pool["Fecha"], prev_start, prev_end)] if has_prev else None

    fleet = _filter(sales[sales["special_fleet"]], models, branches, customer_types)
    fleet = fleet[_between(fleet["Fecha"], start, end)]

    lost_pool = leads[leads["no_availability"] & (include_fleet | ~leads["special_fleet"])]
    lost_pool = _filter(lost_pool, models, branches, customer_types, model_col="Modelo de interés")
    lost = lost_pool[_between(lost_pool["Fecha cierre"], start, end)]

    positive = current[~current["is_credit_note"]]
    units_positive = float(positive["Unidades"].sum())

    months = pd.period_range(start.to_period("M"), end.to_period("M"), freq="M")
    by_month = current.groupby(current["Fecha"].dt.to_period("M")).agg(
        units=("Unidades", "sum"), revenue=("revenue", "sum")
    )
    lost_by_month = lost.groupby(lost["Fecha cierre"].dt.to_period("M"))["Unidades"].sum()
    prev_by_month = (
        previous.groupby((previous["Fecha"] + pd.DateOffset(years=1)).dt.to_period("M"))["Unidades"].sum()
        if previous is not None
        else None
    )
    monthly = [
        s.SalesMonth(
            month=str(m),
            units=int(by_month["units"].get(m, 0)),
            revenue_usd=float(by_month["revenue"].get(m, 0.0)),
            lost_units=int(lost_by_month.get(m, 0)),
            units_prev_year=int(prev_by_month.get(m, 0)) if prev_by_month is not None else None,
        )
        for m in months
    ]

    return s.SalesOverview(
        data_version=dataset.id,
        filters=s.SalesFilters(
            date_from=start.date(),
            date_to=end.date(),
            models=models,
            branches=branches,
            customer_types=customer_types,
            include_fleet=include_fleet,
        ),
        options=s.SalesOptions(
            models=base.models,
            branches=sorted(sales["Sucursal"].dropna().unique().tolist()),
            customer_types=sorted(sales["Tipo de cliente"].dropna().unique().tolist()),
            min_date=min_date.date(),
            max_date=max_date.date(),
        ),
        kpis=s.SalesKpis(
            units=int(current["Unidades"].sum()),
            revenue_usd=float(current["revenue"].sum()),
            avg_price_usd=float(positive["revenue"].sum()) / units_positive if units_positive else None,
            invoices=int((~current["is_credit_note"]).sum()),
            credit_notes=int(current["is_credit_note"].sum()),
            lost_units=int(lost["Unidades"].sum()),
            fleet_units=int(fleet["Unidades"].sum()),
            units_prev_year=int(previous["Unidades"].sum()) if previous is not None else None,
            revenue_prev_year=float(previous["revenue"].sum()) if previous is not None else None,
        ),
        monthly=monthly,
        by_model=_groups(current, previous, ["Modelo"]),
        by_branch=_groups(current, previous, ["Sucursal"]),
        by_customer_type=_groups(current, previous, ["Tipo de cliente"]),
        top_versions=_groups(current, previous, ["Modelo", "Versión"], TOP_N),
        top_sellers=_groups(current, previous, ["Vendedor", "Sucursal"], TOP_N),
    )
