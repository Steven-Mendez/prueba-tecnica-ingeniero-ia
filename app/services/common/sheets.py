"""Explorador de hojas compartido: cada hoja del Excel por separado, tal como llega o ya limpia, paginada."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd

from app.schemas import data as s
from app.services.common.errors import DataError


@dataclass(frozen=True)
class SheetSpec:
    sheet: str
    label: str
    description: str
    clean_attr: str | None  # tabla de la base limpia con la versión limpia
    date_column: str | None
    model_column: str | None  # columna del filtro principal (modelo en el Caso 1, gestor en el Caso 2)
    derived: tuple[tuple[str, str], ...] = ()  # columnas que agrega la limpieza: (columna, etiqueta)
    reset_index: bool = False  # la tabla limpia tiene el índice en una columna del Excel


def frame(raw: pd.DataFrame | None, clean: pd.DataFrame | None, spec: SheetSpec) -> pd.DataFrame:
    """La hoja ya limpia, con las columnas del Excel en su orden y al final las que agrega la limpieza."""
    if raw is None:
        return pd.DataFrame()
    if clean is None:
        return raw
    if spec.reset_index:
        clean = clean.reset_index()
    columns = [c for c in raw.columns if c in clean.columns] + [
        c for c, _ in spec.derived if c in clean.columns
    ]
    return clean[columns]


def column_type(series: pd.Series, name: str) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "bool"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_numeric_dtype(series):
        return "money" if "(USD)" in name or "USD" in name else "number"
    return "text"


def cell(value: Any) -> Any:
    if value is None or (isinstance(value, float) and np.isnan(value)) or value is pd.NaT:
        return None
    if isinstance(value, pd.Timestamp | datetime):
        ts = pd.Timestamp(value)  # las hojas sin limpiar traen datetime de Python en columnas object
        return ts.date().isoformat() if ts == ts.normalize() else ts.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if np.isnan(value) else float(value)
    if isinstance(value, pd.Period):
        return str(value)
    if pd.isna(value):
        return None
    return value


def sheet_info(key: str, spec: SheetSpec, raw: pd.DataFrame, clean: pd.DataFrame) -> s.SheetInfo:
    dates = (
        clean[spec.date_column].dropna()
        if spec.date_column in clean.columns
        else pd.Series(dtype="datetime64[ns]")
    )
    return s.SheetInfo(
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


def paginate(
    df: pd.DataFrame,
    spec: SheetSpec,
    key: str,
    filter_values: list[str],
    filter_label: str = "Modelo",
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
        s.Column(
            key=str(c), label=labels.get(c, str(c)), type=column_type(df[c], str(c)), derived=c in derived
        )
        for c in df.columns
    ]
    rows = [[cell(v) for v in row] for row in chunk.itertuples(index=False, name=None)]
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
        models=filter_values,
        filter_label=filter_label,
    )
