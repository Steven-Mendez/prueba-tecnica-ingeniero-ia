"""Explorador de la fuente: cada hoja del Excel por separado, tal como llega o ya limpia."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd

from app.schemas import data as s
from app.services.factory_order.base import DataError
from app.services.factory_order.source import LoadedDataset, SourceStatus


@dataclass(frozen=True)
class SheetSpec:
    sheet: str
    label: str
    description: str
    clean_attr: str | None  # tabla de CleanBase con la versión limpia
    date_column: str | None
    model_column: str | None
    derived: tuple[tuple[str, str], ...] = ()  # columnas que agrega la limpieza: (columna, etiqueta)


# Hojas con datos que usa el planificador. El Diccionario del Excel es documentación: no se expone como fuente
# (la limpieza solo lo lee, si está, para comparar la fecha de corte).
SHEETS: dict[str, SheetSpec] = {
    "sales": SheetSpec(
        "Ventas",
        "Ventas",
        "Una línea por factura.",
        "sales",
        "Fecha",
        "Modelo",
        (
            ("is_credit_note", "Nota de crédito"),
            ("special_fleet", "Flota especial"),
            ("price_in_cordobas", "Precio en córdobas"),
            ("price_usd_converted", "Precio USD corregido"),
        ),
    ),
    "inventory": SheetSpec(
        "Inventario",
        "Inventario",
        "Cierre de cada mes por modelo, versión y color.",
        "inventory",
        "Mes (cierre)",
        "Modelo",
        (("age_days", "Antigüedad imputada (días)"),),
    ),
    "leads": SheetSpec(
        "Leads",
        "Leads",
        "Oportunidades del CRM.",
        "leads",
        "Fecha cierre",
        "Modelo de interés",
        (("special_fleet", "Flota especial"), ("no_availability", "Perdido por disponibilidad")),
    ),
    "orders": SheetSpec(
        "Pedidos",
        "Pedidos a fábrica",
        "Líneas confirmadas por fábrica.",
        "orders",
        "Fecha pedido",
        "Modelo",
        (("in_order_window", "En ventana trimestral"),),
    ),
    "economics": SheetSpec(
        "Economía por modelo",
        "Economía por modelo",
        "Precio, margen y costo financiero.",
        "economics",
        None,
        "Modelo",
    ),
    "communications": SheetSpec(
        "Comunicados",
        "Comunicados",
        "Mensajes de fábrica y de la gerencia.",
        "communications",
        "Fecha",
        None,
    ),
}


def _frame(dataset: LoadedDataset, spec: SheetSpec) -> pd.DataFrame:
    """La hoja ya limpia, con las columnas del Excel en su orden y al final las que agrega la limpieza."""
    raw = dataset.raw.get(spec.sheet)
    if raw is None:
        return pd.DataFrame()
    if spec.clean_attr is None:
        return raw
    clean = getattr(dataset.base, spec.clean_attr)
    if spec.clean_attr == "economics":
        clean = clean.reset_index()
    columns = [c for c in raw.columns if c in clean.columns] + [
        c for c, _ in spec.derived if c in clean.columns
    ]
    return clean[columns]


def _type(series: pd.Series, name: str) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "bool"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_numeric_dtype(series):
        return "money" if "(USD)" in name or "USD" in name else "number"
    return "text"


def _cell(value: Any) -> Any:
    if value is None or (isinstance(value, float) and np.isnan(value)) or value is pd.NaT:
        return None
    if isinstance(value, pd.Timestamp | datetime):
        return value.date().isoformat() if value == value.normalize() else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if np.isnan(value) else float(value)
    if pd.isna(value):
        return None
    return value


def sheet_infos(dataset: LoadedDataset) -> list[s.SheetInfo]:
    infos = []
    for key, spec in SHEETS.items():
        raw = dataset.raw.get(spec.sheet)
        if raw is None:
            continue
        clean = _frame(dataset, spec)
        dates = (
            clean[spec.date_column].dropna()
            if spec.date_column in clean.columns
            else pd.Series(dtype="datetime64[ns]")
        )
        infos.append(
            s.SheetInfo(
                key=key,
                sheet=spec.sheet,
                label=spec.label,
                description=spec.description,
                rows=len(raw),
                clean_rows=len(clean),
                date_column=spec.date_column,
                date_from=dates.min().date() if not dates.empty else None,
                date_to=dates.max().date() if not dates.empty else None,
            )
        )
    return infos


def status(dataset: LoadedDataset, source: SourceStatus) -> s.DataStatus:
    summary = dataset.summary
    return s.DataStatus(
        path=source.path,
        file_name=dataset.file_name,
        version=dataset.id,
        loaded_at=dataset.loaded_at,
        modified_at=dataset.modified_at,
        checked_at=source.checked_at,
        check_seconds=source.check_seconds,
        last_error=source.last_error,
        last_error_at=source.last_error_at,
        data_cutoff=dataset.base.data_cutoff.date(),
        period_start=summary.period_start.date(),
        period_end=summary.period_end.date(),
        models=dataset.base.models,
        sheets=sheet_infos(dataset),
        changes=[s.CleaningChange(**c.__dict__) for c in summary.changes],
        quality=[s.QualityIssue(**q.__dict__) for q in summary.quality],
        reconciliation_differences=summary.reconciliation_differences,
        reconciliation_cells=summary.reconciliation_cells,
        warnings=summary.warnings,
    )


def sheet_page(
    dataset: LoadedDataset,
    key: str,
    page: int = 1,
    page_size: int = 50,
    q: str = "",
    model: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    flag: str | None = None,
    sort: str | None = None,
    desc: bool = False,
) -> s.SheetPage:
    spec = SHEETS.get(key)
    if spec is None:
        raise DataError(f"No existe la hoja «{key}». Hojas: {', '.join(SHEETS)}.", 404)
    df = _frame(dataset, spec)
    derived = {c for c, _ in spec.derived}
    labels = dict(spec.derived)

    mask = pd.Series(True, index=df.index)
    if model and spec.model_column in df.columns:
        mask &= df[spec.model_column] == model
    if spec.date_column in df.columns:
        dates = pd.to_datetime(df[spec.date_column], errors="coerce")
        if date_from:
            mask &= dates >= pd.Timestamp(date_from)
        if date_to:
            mask &= dates <= pd.Timestamp(date_to)
    if flag:
        if flag not in df.columns or not pd.api.types.is_bool_dtype(df[flag]):
            raise DataError(f"«{flag}» no es una marca de la hoja {spec.label}.")
        mask &= df[flag]
    if q.strip():
        text = df.select_dtypes(exclude=["number", "bool", "datetime"]).astype(str)
        hits = pd.Series(False, index=df.index)
        for col in text.columns:
            hits |= text[col].str.contains(q.strip(), case=False, regex=False, na=False)
        mask &= hits
    filtered = df[mask]
    if sort:
        if sort not in filtered.columns:
            raise DataError(f"No se puede ordenar por «{sort}».")
        filtered = filtered.sort_values(sort, ascending=not desc, na_position="last", kind="stable")

    page_size = max(1, min(page_size, 500))
    page = max(1, page)
    chunk = filtered.iloc[(page - 1) * page_size : page * page_size]
    columns = [
        s.Column(key=str(c), label=labels.get(c, str(c)), type=_type(df[c], str(c)), derived=c in derived)
        for c in df.columns
    ]
    rows = [[_cell(v) for v in row] for row in chunk.itertuples(index=False, name=None)]
    return s.SheetPage(
        key=key,
        sheet=spec.sheet,
        columns=columns,
        rows=rows,
        total=len(filtered),
        page=page,
        page_size=page_size,
        model_column=spec.model_column if spec.model_column in df.columns else None,
        date_column=spec.date_column if spec.date_column in df.columns else None,
        models=dataset.base.models,
    )
