"""Explorador de la fuente del Caso 1: cada hoja del Excel por separado, tal como llega o ya limpia."""

from datetime import date

import pandas as pd

from app.schemas import data as s
from app.services.common.errors import DataError
from app.services.common.sheets import SheetSpec, frame, paginate, sheet_info
from app.services.factory_order.source import LoadedDataset, SourceStatus

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
        reset_index=True,
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
    raw = dataset.raw.get(spec.sheet)
    clean = getattr(dataset.base, spec.clean_attr) if spec.clean_attr and raw is not None else None
    return frame(raw, clean, spec)


def sheet_infos(dataset: LoadedDataset) -> list[s.SheetInfo]:
    return [
        sheet_info(key, spec, dataset.raw[spec.sheet], _frame(dataset, spec))
        for key, spec in SHEETS.items()
        if spec.sheet in dataset.raw
    ]


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
    return paginate(
        _frame(dataset, spec),
        spec,
        key,
        dataset.base.models,
        "Modelo",
        page,
        page_size,
        q,
        model,
        date_from,
        date_to,
        flag,
        sort,
        desc,
    )
