"""Lectura y limpieza del Excel del Caso 2: puerto de `notebooks/caso2/00_limpieza.ipynb`.

Aplica los mismos supuestos (S2.1–S2.9, S2.12, S2.13) en el mismo orden de operaciones, de modo que las tablas
coinciden con las que el notebook guarda en `data/processed/caso2_limpio.pkl`. Donde el notebook se detiene con
un `assert`, aquí se lanza `DataError` con un mensaje para el usuario.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from app.services.common.excel import read_excel  # noqa: F401 - la lectura es común a los dos casos
from app.services.renewals.base import CleaningSummary, DataError, QualityIssue, RenewalsBase

# Parámetros del caso (PARAMS de 00_limpieza)
STAFFING_CHANGE_DATE = pd.Timestamp("2025-12-01")  # salida de G06 y G07 (hoja Equipo)
DAILY_CALL_TARGET = 50  # meta de llamadas por gestor y día
STANDARD_LEAD_DAYS = 20  # estándar: contactar 20 días antes del vencimiento

# Parámetros de limpieza (00_limpieza §3)
EFFECTIVE_RESULTS = ["Contactado", "Pide llamar después", "Cotización enviada", "Cierre"]  # S2.12
CALL_RESULTS = ["No contesta", "Número equivocado", *EFFECTIVE_RESULTS]
SHARED_PHONE_MAX_CLIENTS = 5  # S2.3
LEAD_TIME_BINS = [-99, -1, 3, 7, 14, 20, 25, 31]  # S2.13 (pd.cut cierra a la derecha: "0-3" = {0,1,2,3})
LEAD_TIME_LABELS = ["Después del venc.", "0-3", "4-7", "8-14", "15-20", "21-25", "26-30"]
PERIOD_LABELS = {7: "7 gestores (sep-nov 25)", 5: "5 gestores (dic 25 →)"}
RENEWED_VALUES = {"sí": 1, "si": 1, "no": 0}  # S2.2

REQUIRED_COLUMNS: dict[str, list[str]] = {
    "Renovaciones": [
        "Póliza",
        "ID cliente",
        "Teléfono cliente",
        "Ramo",
        "Aseguradora",
        "Prima anterior (USD)",
        "Prima de renovación (USD)",
        "% cambio de prima",
        "% comisión",
        "Fecha de vencimiento",
        "Forma de pago",
        "Segmento",
        "Antigüedad del cliente (años)",
        "Siniestros último año",
        "Origen",
        "Gestor",
        "Fecha primer contacto",
        "Número de intentos",
        "Renovó",
        "Motivo de no renovación",
    ],
    "Bitacora_Llamadas": ["ID llamada", "Fecha y hora", "Gestor", "Póliza", "Duración (seg)", "Resultado"],
    "Equipo": [],  # dos tablas apiladas: se valida en split_team
}
DATE_COLUMNS = {
    "Renovaciones": ["Fecha de vencimiento", "Fecha primer contacto"],
    "Bitacora_Llamadas": ["Fecha y hora"],
}


def _check_structure(raw: dict[str, pd.DataFrame]) -> None:
    for sheet, columns in REQUIRED_COLUMNS.items():
        if sheet not in raw:
            raise DataError(f"Falta la hoja «{sheet}» en el Excel. Hojas: {', '.join(raw)}.")
        missing = [c for c in columns if c not in raw[sheet].columns]
        if missing:
            raise DataError(f"La hoja «{sheet}» no tiene las columnas: {', '.join(missing)}.")
    for sheet, columns in DATE_COLUMNS.items():
        for column in columns:
            series = raw[sheet][column]
            if not pd.api.types.is_datetime64_any_dtype(series):
                parsed = pd.to_datetime(series, errors="coerce")
                if parsed.isna().sum() > series.isna().sum():
                    raise DataError(f"«{column}» de la hoja «{sheet}» tiene fechas que no se pueden leer.")
                raw[sheet] = raw[sheet].assign(**{column: parsed})


def split_team(sheet: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """La hoja *Equipo* trae dos tablas apiladas: los gestores y la dotación por periodo (00_limpieza §4.1)."""
    first_col = sheet.iloc[:, 0]
    header_rows = sheet.index[first_col.astype(str).str.strip() == "Periodo"]
    blank_rows = sheet.index[first_col.isna()]
    if len(header_rows) == 0 or len(blank_rows) == 0:
        raise DataError("La hoja «Equipo» no tiene la tabla de dotación por periodo (fila «Periodo»).")
    header_row = header_rows[0]
    team = sheet.iloc[: blank_rows[0]].copy()
    staffing = sheet.iloc[header_row + 1 :].copy()
    staffing.columns = sheet.iloc[header_row].tolist()
    staffing = staffing.dropna(axis=1, how="all")
    for column in ("Código", "Nombre", "Estado", "Meta llamadas diarias"):
        if column not in team.columns:
            raise DataError(f"La hoja «Equipo» no tiene la columna «{column}».")
    return team, staffing


def clean_renewals(ren_raw: pd.DataFrame) -> pd.DataFrame:
    """00_limpieza §4.2 y §4.3: duplicados, *Renovó*, teléfonos, comisión y periodo."""
    r = ren_raw.drop_duplicates().copy()  # S2.1
    r["renewed"] = r["Renovó"].str.strip().str.lower().map(RENEWED_VALUES)  # S2.2
    if r["renewed"].isna().any():
        unknown = r.loc[r["renewed"].isna(), "Renovó"].unique()
        raise DataError(f"Valor de 'Renovó' no reconocido: {', '.join(map(str, unknown))}.")

    # S2.3
    r["phone_format_ok"] = r["Teléfono cliente"].str.fullmatch(r"\d{4}-\d{4}").fillna(False).astype(bool)
    clientes_por_tel = r.groupby("Teléfono cliente")["ID cliente"].nunique()
    r["shared_phone"] = r["Teléfono cliente"].map(clientes_por_tel).gt(SHARED_PHONE_MAX_CLIENTS).fillna(False)
    r["valid_phone"] = r["phone_format_ok"] & ~r["shared_phone"]

    r["expiry_month"] = r["Fecha de vencimiento"].dt.to_period("M")
    r["potential_commission"] = r["Prima de renovación (USD)"] * r["% comisión"]  # S2.9
    r["earned_commission"] = r["potential_commission"] * r["renewed"]
    r["active_agents"] = np.where(r["Fecha de vencimiento"] < STAFFING_CHANGE_DATE, 7, 5)  # S2.7
    r["period"] = r["active_agents"].map(PERIOD_LABELS)
    return r


def clean_calls(calls_raw: pd.DataFrame) -> pd.DataFrame:
    """00_limpieza §4.4: la bitácora con fecha, mes, hora, contacto efectivo e intento."""
    calls = calls_raw.copy()
    calls["date"] = calls["Fecha y hora"].dt.normalize()
    calls["month"] = calls["Fecha y hora"].dt.to_period("M")
    calls["hour"] = calls["Fecha y hora"].dt.hour
    calls["is_effective"] = calls["Resultado"].isin(EFFECTIVE_RESULTS)  # S2.12
    calls = calls.sort_values("Fecha y hora")
    calls["attempt_no"] = calls.groupby("Póliza").cumcount() + 1
    return calls


def policy_summary(calls: pd.DataFrame) -> pd.DataFrame:
    """Una fila por póliza con lo que dice la bitácora."""
    effective = calls[calls["is_effective"]]
    by_policy = calls.groupby("Póliza")
    return pd.DataFrame(
        {
            "calls_logged": by_policy.size(),
            "first_call": by_policy["date"].min(),
            "first_effective_contact": effective.groupby("Póliza")["date"].min(),
            "attempt_first_effective": effective.groupby("Póliza")["attempt_no"].min(),
            "had_closing_call": by_policy["Resultado"].agg(lambda s: (s == "Cierre").any()),
            "last_result": by_policy["Resultado"].last(),
        }
    )


def merge_calls(r: pd.DataFrame, calls: pd.DataFrame) -> pd.DataFrame:
    """00_limpieza §4.4: cruce con la bitácora, primer contacto completado, anticipación y tramos."""
    r = r.merge(policy_summary(calls), left_on="Póliza", right_index=True, how="left")
    r["first_contact_missing"] = r["Fecha primer contacto"].isna()
    r["Fecha primer contacto"] = r["Fecha primer contacto"].fillna(r["first_call"])  # S2.4
    if r["Fecha primer contacto"].isna().any():
        raise DataError(
            f"{int(r['Fecha primer contacto'].isna().sum())} pólizas sin fecha de primer contacto ni llamadas "
            "en la bitácora."
        )
    r["lead_days"] = (r["Fecha de vencimiento"] - r["Fecha primer contacto"]).dt.days  # S2.8
    r["lead_days_effective"] = (r["Fecha de vencimiento"] - r["first_effective_contact"]).dt.days
    r["lead_bucket"] = pd.cut(r["lead_days"], LEAD_TIME_BINS, labels=LEAD_TIME_LABELS)  # S2.13
    if r["lead_bucket"].isna().any():
        raise DataError(
            f"Anticipación fuera de los tramos definidos en {int(r['lead_bucket'].isna().sum())} pólizas "
            f"(rango {r['lead_days'].min()} a {r['lead_days'].max()} días)."
        )
    r["renewed_without_closing"] = (r["renewed"] == 1) & ~r["had_closing_call"].fillna(False).astype(
        bool
    )  # S2.5
    return r


def quality_table(ren_raw: pd.DataFrame, r: pd.DataFrame) -> pd.DataFrame:
    """00_limpieza §5: la tabla de calidad de datos."""
    return pd.DataFrame(
        [
            ("Renovaciones", "Filas duplicadas exactas", ren_raw.duplicated().sum(), "Eliminadas (S2.1)"),
            (
                "Renovaciones",
                "'Renovó' con 4 grafías (Sí/SI/No/no)",
                (~ren_raw["Renovó"].isin(["Sí", "No"])).sum(),
                "Normalizado a 1/0 (S2.2)",
            ),
            (
                "Renovaciones",
                "Teléfono nulo, de relleno o con formato inválido",
                int((~r["phone_format_ok"]).sum()),
                "Marcado como no contactable (S2.3)",
            ),
            (
                "Renovaciones",
                "Teléfono con formato válido compartido por decenas de clientes",
                int((r["phone_format_ok"] & r["shared_phone"]).sum()),
                "Marcado como no contactable (S2.3)",
            ),
            (
                "Renovaciones",
                "Fecha de primer contacto nula",
                int(r["first_contact_missing"].sum()),
                "Completada con la primera llamada de la bitácora (S2.4)",
            ),
            (
                "Renovaciones",
                "Renovó = Sí sin llamada de 'Cierre' ni contacto efectivo",
                int(r["renewed_without_closing"].sum()),
                "Se respeta 'Renovó'; se mantiene en el diagnóstico y el prototipo la saca de la cola (S2.5)",
            ),
            (
                "Renovaciones",
                "Primer contacto después del vencimiento",
                int((r["lead_days"] < 0).sum()),
                "Se mantiene: contacto tardío real (S2.6)",
            ),
            (
                "Bitácora",
                "IDs duplicados, pólizas inexistentes, llamadas fuera de horario",
                0,
                "Sin tratamiento",
            ),
            ("Ambas", "Intentos y primer contacto vs bitácora", "0 dif.", "Cuadra: sin tratamiento"),
        ],
        columns=["Hoja", "Problema", "Filas", "Tratamiento"],
    )


def clean(raw: dict[str, pd.DataFrame]) -> tuple[RenewalsBase, CleaningSummary]:
    """Valida la estructura y aplica la limpieza del notebook en el mismo orden."""
    raw = dict(raw)
    _check_structure(raw)
    team, staffing = split_team(raw["Equipo"])
    ren_raw = raw["Renovaciones"]
    r = clean_renewals(ren_raw)
    calls = clean_calls(raw["Bitacora_Llamadas"])
    warnings: list[str] = []

    unknown_results = sorted(set(calls["Resultado"].dropna()) - set(CALL_RESULTS))
    if unknown_results:
        warnings.append(f"Resultados de llamada no previstos: {', '.join(unknown_results)}.")
    orphan_calls = int((~calls["Póliza"].isin(r["Póliza"])).sum())
    if orphan_calls:
        warnings.append(f"{orphan_calls} llamadas a pólizas que no están en Renovaciones.")
    duplicate_ids = int(calls["ID llamada"].duplicated().sum())
    if duplicate_ids:
        warnings.append(f"{duplicate_ids} IDs de llamada repetidos en la bitácora.")

    r = merge_calls(r, calls)
    mismatched = int((r["Número de intentos"] != r["calls_logged"]).sum())
    if mismatched:
        warnings.append(f"'Número de intentos' no coincide con la bitácora en {mismatched} pólizas.")
    moved = int(((r["Fecha primer contacto"] != r["first_call"]) & ~r["first_contact_missing"]).sum())
    if moved:
        warnings.append(f"'Fecha primer contacto' difiere de la primera llamada en {moved} pólizas.")

    quality = quality_table(ren_raw, r)
    base = RenewalsBase(
        renewals=r,
        calls=calls,
        team=team,
        staffing=staffing,
        quality=quality,
        staffing_change_date=STAFFING_CHANGE_DATE,
        daily_call_target=DAILY_CALL_TARGET,
        standard_lead_days=STANDARD_LEAD_DAYS,
        period_start=r["Fecha de vencimiento"].min(),
        period_end=r["Fecha de vencimiento"].max(),
    )
    summary = CleaningSummary(
        sheets={name: len(df) for name, df in raw.items()},
        quality=[
            QualityIssue(sheet=row.Hoja, issue=row.Problema, rows=str(row.Filas), treatment=row.Tratamiento)
            for row in quality.itertuples()
        ],
        duplicates_removed=int(ren_raw.duplicated().sum()),
        invalid_phones=int((~r["valid_phone"]).sum()),
        first_contact_filled=int(r["first_contact_missing"].sum()),
        renewed_without_closing=int(r["renewed_without_closing"].sum()),
        late_first_contacts=int((r["lead_days"] < 0).sum()),
        warnings=warnings,
    )
    return base, summary


def load(source: bytes | Path) -> tuple[RenewalsBase, CleaningSummary]:
    return clean(read_excel(source))
