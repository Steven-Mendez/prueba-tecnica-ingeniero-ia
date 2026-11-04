"""Explorador de la fuente del Caso 2: cada hoja del Excel por separado, tal como llega o ya limpia."""

from datetime import date

import pandas as pd

from app.schemas import data as s
from app.services.common.errors import DataError
from app.services.common.sheets import SheetSpec, frame, paginate, sheet_info
from app.services.renewals.source import LoadedRenewals, SourceStatus

# El Diccionario del Excel es documentación: no se expone como fuente.
SHEETS: dict[str, SheetSpec] = {
    "renewals": SheetSpec(
        "Renovaciones",
        "Renovaciones",
        "Una fila por póliza que venció en el periodo.",
        "renewals",
        "Fecha de vencimiento",
        "Gestor",
        (
            ("renewed", "Renovó (1/0)"),
            ("valid_phone", "Teléfono válido"),
            ("shared_phone", "Teléfono compartido"),
            ("potential_commission", "Comisión potencial (USD)"),
            ("earned_commission", "Comisión cobrada (USD)"),
            ("period", "Periodo"),
            ("calls_logged", "Llamadas en bitácora"),
            ("first_contact_missing", "Primer contacto completado"),
            ("lead_days", "Anticipación (días)"),
            ("lead_bucket", "Tramo de anticipación"),
            ("renewed_without_closing", "Renovó sin cierre"),
        ),
    ),
    "calls": SheetSpec(
        "Bitacora_Llamadas",
        "Bitácora de llamadas",
        "Cada llamada realizada por los gestores.",
        "calls",
        "Fecha y hora",
        "Gestor",
        (("is_effective", "Contacto efectivo"), ("attempt_no", "Intento nº")),
    ),
    "team": SheetSpec(
        "Equipo",
        "Equipo",
        "Gestores del área: ingreso, salida, horario y metas.",
        "team",
        None,
        None,
    ),
}


def _frame(dataset: LoadedRenewals, spec: SheetSpec) -> pd.DataFrame:
    raw = dataset.raw.get(spec.sheet)
    clean = getattr(dataset.base, spec.clean_attr) if spec.clean_attr and raw is not None else None
    return frame(raw, clean, spec)


def sheet_infos(dataset: LoadedRenewals) -> list[s.SheetInfo]:
    return [
        sheet_info(key, spec, dataset.raw[spec.sheet], _frame(dataset, spec))
        for key, spec in SHEETS.items()
        if spec.sheet in dataset.raw
    ]


def agents(dataset: LoadedRenewals) -> list[str]:
    return sorted(dataset.base.team["Código"].astype(str))


def status(dataset: LoadedRenewals, source: SourceStatus) -> s.RenewalsDataStatus:
    base, summary = dataset.base, dataset.summary
    return s.RenewalsDataStatus(
        path=source.path,
        file_name=dataset.file_name,
        version=dataset.id,
        loaded_at=dataset.loaded_at,
        modified_at=dataset.modified_at,
        checked_at=source.checked_at,
        check_seconds=source.check_seconds,
        last_error=source.last_error,
        last_error_at=source.last_error_at,
        period_start=base.period_start.date(),
        period_end=base.period_end.date(),
        sheets=sheet_infos(dataset),
        quality=[s.QualityIssue(**q.__dict__) for q in summary.quality],
        warnings=summary.warnings,
        staffing_change_date=base.staffing_change_date.date(),
        policies=len(base.renewals),
        calls=len(base.calls),
        months=int(base.renewals["expiry_month"].nunique()),
        duplicates_removed=summary.duplicates_removed,
        invalid_phones=summary.invalid_phones,
        first_contact_filled=summary.first_contact_filled,
        renewed_without_closing=summary.renewed_without_closing,
        late_first_contacts=summary.late_first_contacts,
    )


def sheet_page(
    dataset: LoadedRenewals,
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
        agents(dataset),
        "Gestor",
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
