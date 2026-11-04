"""Estructuras compartidas por la limpieza y el motor del Caso 2."""

from dataclasses import dataclass, field

import pandas as pd

from app.services.common.errors import DataError  # noqa: F401 - el error es común a los dos casos
from app.services.factory_order.base import QualityIssue  # noqa: F401 - misma forma en los dos casos


@dataclass(frozen=True)
class RenewalsBase:
    """Base limpia: las mismas tablas que `00_limpieza` guarda en `data/processed/caso2_limpio.pkl`.

    Las columnas conservan los nombres del Excel (en español); las que agrega la limpieza (`renewed`,
    `valid_phone`, `lead_days`, `lead_bucket`, `potential_commission`, …) llevan los mismos nombres que en el
    notebook. Ninguna función del motor modifica estas tablas: se comparten entre peticiones.
    """

    renewals: pd.DataFrame  # una fila por póliza
    calls: pd.DataFrame  # bitácora con date, month, hour, is_effective, attempt_no
    team: pd.DataFrame  # gestores (hoja Equipo, tabla superior)
    staffing: pd.DataFrame  # dotación por periodo (hoja Equipo, tabla inferior)
    quality: pd.DataFrame  # tabla de calidad de datos del notebook
    staffing_change_date: pd.Timestamp  # desde cuándo trabajan 5 gestores
    daily_call_target: int  # meta de llamadas por gestor y día hábil
    standard_lead_days: int  # estándar de contacto: días antes del vencimiento
    period_start: pd.Timestamp  # primer vencimiento
    period_end: pd.Timestamp  # último vencimiento


@dataclass(frozen=True)
class CleaningSummary:
    """Lo que hizo la limpieza, para la pantalla de estado de la fuente."""

    sheets: dict[str, int]
    quality: list[QualityIssue]
    duplicates_removed: int
    invalid_phones: int
    first_contact_filled: int
    renewed_without_closing: int
    late_first_contacts: int
    warnings: list[str] = field(default_factory=list)
