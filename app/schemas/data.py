"""Esquemas de la fuente de datos y del explorador de hojas. `frontend/src/features/data/types.ts` los replica."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class CleaningChange(BaseModel):
    sheet: str
    column: str
    variants_before: int
    variants_after: int
    cells_changed: int


class QualityIssue(BaseModel):
    sheet: str
    issue: str
    rows: str
    treatment: str


class SheetInfo(BaseModel):
    key: str = Field(description="Identificador de la hoja en la API")
    sheet: str = Field(description="Nombre de la hoja en el Excel")
    label: str
    description: str
    rows: int = Field(description="Filas en el Excel")
    clean_rows: int = Field(description="Filas tras la limpieza")
    date_column: str | None
    date_from: date | None
    date_to: date | None


class SourceStatusBase(BaseModel):
    """Estado de una fuente: qué versión del Excel del ETL se está usando y qué hizo la limpieza con ella."""

    path: str
    file_name: str
    version: str
    loaded_at: datetime
    modified_at: datetime
    checked_at: datetime | None
    check_seconds: float | None = Field(
        description="Cada cuántos segundos se revisa la fuente; None = se lee una vez (prototipo)"
    )
    last_error: str | None = Field(
        description="Última entrega del ETL rechazada; se sigue usando la versión buena"
    )
    last_error_at: datetime | None
    period_start: date
    period_end: date
    sheets: list[SheetInfo]
    quality: list[QualityIssue]
    warnings: list[str]


class DataStatus(SourceStatusBase):
    """Fuente del Caso 1 (pedido a fábrica)."""

    data_cutoff: date
    models: list[str]
    changes: list[CleaningChange]
    reconciliation_differences: int
    reconciliation_cells: int


class RenewalsDataStatus(SourceStatusBase):
    """Fuente del Caso 2 (renovaciones)."""

    staffing_change_date: date = Field(description="Desde cuándo trabajan 5 gestores (salida de G06 y G07)")
    policies: int = Field(description="Pólizas tras la limpieza")
    calls: int = Field(description="Llamadas en la bitácora")
    months: int = Field(description="Meses de vencimientos en la base")
    duplicates_removed: int
    invalid_phones: int
    first_contact_filled: int
    renewed_without_closing: int
    late_first_contacts: int


class Column(BaseModel):
    key: str
    label: str
    type: Literal["text", "number", "money", "date", "bool"]
    derived: bool = Field(description="Columna que agrega la limpieza (no está en el Excel)")


class SheetPage(BaseModel):
    key: str
    sheet: str
    columns: list[Column]
    rows: list[list[Any]] = Field(description="Filas en el orden de `columns`")
    total: int
    page: int
    page_size: int
    model_column: str | None
    date_column: str | None
    models: list[str] = Field(
        description="Valores del filtro principal (modelos en el Caso 1, gestores en el 2)"
    )
    filter_label: str = "Modelo"
