"""Motor de la cola de renovaciones: puerto de `notebooks/caso2/02_prototipo_priorizacion.ipynb` §2–§8.

Funciones puras sobre las tablas de la base limpia. Los nombres de columna derivados (`canal`,
`primer_contacto_simulado`, `lead_simulado`, `bucket_simulado`) y las etiquetas de canal son los del notebook,
y `queue_csv` hace exactamente la misma llamada `to_csv` que §7, así que con los valores por defecto la cola del
día de ejemplo coincide byte a byte con `outputs/cola_renovaciones_2026-09-15.csv`.
"""

from dataclasses import dataclass
from statistics import NormalDist

import numpy as np
import pandas as pd

from app.services.renewals.cleaning import EFFECTIVE_RESULTS, LEAD_TIME_BINS, LEAD_TIME_LABELS

# Parámetros del prototipo (supuestos S2.11, S2.14–S2.16)
AGENTS = 5
DAILY_CAPACITY = 250  # AGENTES × meta diaria
OPEN_DAYS = 14  # el expediente entra a la cola 14 días antes del vencimiento
DEADLINE_DAYS = 8  # fecha límite para el primer contacto: 8 días antes (fin de la ventana 8-14)
WINDOW_BUCKETS = ("8-14",)  # tramo objetivo
LATE_BUCKET = "0-3"  # práctica actual
GRACE_DAYS = 7  # hasta cuántos días después del vencimiento se sigue intentando el primer contacto
TARGET_WINDOW_SHARE = 0.70  # meta del piloto
EXAMPLE_DAY = pd.Timestamp("2026-09-15")  # DIA_EJEMPLO
PILOT_DELTA = 0.05  # mejora que el piloto debe poder detectar
SENSITIVITY_CAPACITIES = (225, 200, 180)

CHANNEL_PHONE = "Cola telefónica"
CHANNEL_AUTO = "Canal automático (WhatsApp / correo)"
CHANNEL_FIX = "Corrección de datos (teléfono inválido)"
CHANNEL_ORDER = [CHANNEL_PHONE, CHANNEL_AUTO, CHANNEL_FIX]

QUEUE_COLUMNS = [  # lo que el gestor necesita para llamar y argumentar, en este orden (§7)
    "Póliza",
    "ID cliente",
    "Teléfono cliente",
    "Ramo",
    "Segmento",
    "Aseguradora",
    "Forma de pago",
    "Fecha de vencimiento",
    "Días al vencimiento",
    "Días para la fecha límite",
    "Prima anterior (USD)",
    "Prima de renovación (USD)",
    "% cambio de prima",
    "Comisión potencial (USD)",
    "Mejora esperada",
    "Score (USD)",
    "Gestor",
]
PCT_COLUMNS = ("% cambio de prima", "Mejora esperada")


# --- §2 Enrutamiento por canal -------------------------------------------------------------------------------


def is_automatic(ren: pd.DataFrame) -> pd.Series:
    """S2.14: pago distinto de Manual o Flota corporativa → canal automático."""
    return ren["Forma de pago"].ne("Manual") | ren["Segmento"].eq("Flota corporativa")


def route_channels(ren: pd.DataFrame) -> pd.Series:
    return pd.Series(
        np.select([~ren["valid_phone"], is_automatic(ren)], [CHANNEL_FIX, CHANNEL_AUTO], CHANNEL_PHONE),
        index=ren.index,
        name="canal",
    )


def channel_summary(df: pd.DataFrame) -> pd.DataFrame:
    t = df.groupby("canal").agg(
        polizas=("Póliza", "size"),
        comision_potencial=("potential_commission", "sum"),
        tasa_renovacion=("renewed", "mean"),
        llamadas_historicas=("calls_logged", "sum"),
    )
    t["% pólizas"] = t["polizas"] / t["polizas"].sum()
    t["% comisión"] = t["comision_potencial"] / t["comision_potencial"].sum()
    t["% llamadas"] = t["llamadas_historicas"] / t["llamadas_historicas"].sum()
    return t.reindex(CHANNEL_ORDER).fillna(0)


# --- §3 Mejora esperada por segmento y tramo -----------------------------------------------------------------


def rate_table(cola_hist: pd.DataFrame) -> pd.DataFrame:
    """Tasa de renovación en la cola telefónica por segmento y tramo de anticipación."""
    return cola_hist.pivot_table(
        index="Segmento", columns="lead_bucket", values="renewed", aggfunc="mean", observed=True
    )


def count_table(cola_hist: pd.DataFrame) -> pd.DataFrame:
    return cola_hist.pivot_table(
        index="Segmento", columns="lead_bucket", values="renewed", aggfunc="size", observed=True
    )


def rate_by_day(cola_hist: pd.DataFrame) -> pd.DataFrame:
    """Tasa por segmento y día exacto de anticipación (dentro del tramo 8-14 la tasa no es plana)."""
    return cola_hist.pivot_table(index="Segmento", columns="lead_days", values="renewed", aggfunc="mean")


def improvement(tasa: pd.DataFrame) -> pd.Series:
    """S2.15: tasa en la ventana 8-14 menos la tasa a 0-3 días, por segmento."""
    return tasa[list(WINDOW_BUCKETS)].mean(axis=1) - tasa[LATE_BUCKET]


# --- §4 Simulación -------------------------------------------------------------------------------------------


def simulate_queue(
    polizas: pd.DataFrame,
    capacity: int,
    open_days: int = OPEN_DAYS,
    deadline_days: int = DEADLINE_DAYS,
    grace_days: int = GRACE_DAYS,
    mejora: pd.Series | None = None,
) -> pd.Series:
    """Fecha simulada del primer contacto por póliza (S2.16).

    Reglas: apertura a `open_days`, fecha límite a `deadline_days`, orden por fecha límite y después por score;
    los seguimientos (llamadas históricas − 1) consumen capacidad un día cada uno.
    """
    p = polizas.copy()
    p["apertura"] = p["Fecha de vencimiento"] - pd.Timedelta(days=open_days)
    p["limite"] = p["Fecha de vencimiento"] - pd.Timedelta(days=deadline_days)
    p["caduca"] = p["Fecha de vencimiento"] + pd.Timedelta(days=grace_days)
    score_factor = p["Segmento"].map(mejora).fillna(0) if mejora is not None else 1.0
    p["score"] = p["potential_commission"] * score_factor
    p = p.sort_values(["limite", "score"], ascending=[True, False])

    apertura = p["apertura"].to_numpy()
    caduca = p["caduca"].to_numpy()
    seguimientos = (p["calls_logged"].fillna(1).to_numpy() - 1).clip(min=0).astype(int)
    primer_contacto = np.full(len(p), np.datetime64("NaT", "ns"), dtype="datetime64[ns]")
    abierta = np.zeros(len(p), dtype=bool)
    pendientes = np.zeros(len(p), dtype=int)  # seguimientos que faltan por póliza abierta

    for dia in pd.bdate_range(p["apertura"].min(), p["caduca"].max()):
        hoy = np.datetime64(dia)
        # 1) seguimientos del día: una llamada por póliza abierta con seguimientos pendientes
        con_seguimiento = pendientes > 0
        usadas = int(con_seguimiento.sum())
        pendientes[con_seguimiento] -= 1
        # 2) primeros contactos con la capacidad que queda, en el orden de la cola (fecha límite, score)
        cupo = capacity - usadas
        if cupo <= 0:
            continue
        elegibles = np.flatnonzero(~abierta & (apertura <= hoy) & (caduca >= hoy))[:cupo]
        abierta[elegibles] = True
        primer_contacto[elegibles] = hoy
        pendientes[elegibles] = seguimientos[elegibles]
    return pd.Series(primer_contacto, index=p.index, name="primer_contacto_simulado")


def simulated_lead(cola: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    lead = (cola["Fecha de vencimiento"] - cola["primer_contacto_simulado"]).dt.days
    return lead, pd.cut(lead, LEAD_TIME_BINS, labels=LEAD_TIME_LABELS)


def in_window(bucket: pd.Series) -> pd.Series:
    return bucket.isin(WINDOW_BUCKETS)


def capacity_usage(cola5: pd.DataFrame, since: pd.Timestamp) -> pd.DataFrame:
    """Llamadas simuladas por día hábil: primeros contactos y seguimientos (§4, segunda celda)."""
    primeros = cola5["primer_contacto_simulado"].value_counts()
    seguim: list[tuple[pd.Timestamp, int]] = []
    for fecha, grupo in cola5.dropna(subset=["primer_contacto_simulado"]).groupby("primer_contacto_simulado"):
        for k in range(1, int(grupo["calls_logged"].max())):
            seguim.append((fecha + pd.offsets.BDay(k), int((grupo["calls_logged"] - 1 >= k).sum())))
    seguim_s = (
        pd.DataFrame(seguim, columns=["fecha", "n"]).groupby("fecha")["n"].sum()
        if seguim
        else pd.Series(dtype=float)
    )
    uso = pd.DataFrame({"primeros contactos": primeros, "seguimientos": seguim_s}).fillna(0).sort_index()
    uso = uso.loc[str(since.date()) :]
    uso["total"] = uso.sum(axis=1)
    return uso


def opened_later_share(cola5: pd.DataFrame, open_days: int) -> float:
    """Pólizas abiertas un día hábil después de su apertura por falta de cupo."""
    apertura_habil = (cola5["Fecha de vencimiento"] - pd.Timedelta(days=open_days)) + pd.offsets.BDay(0)
    return float((cola5["primer_contacto_simulado"] > apertura_habil).mean())


# --- §5 Impacto esperado -------------------------------------------------------------------------------------


def _lookup(df: pd.DataFrame, key_col: str, table: pd.DataFrame) -> pd.Series:
    """La tasa de cada póliza según su segmento y la clave (tramo o día) en la tabla; NaN si no está."""
    rates = {(seg, key): v for (seg, key), v in table.stack().items()}
    keys = zip(df["Segmento"].astype(str), df[key_col], strict=True)
    return pd.Series([rates.get((seg, key), np.nan) for seg, key in keys], index=df.index, dtype=float)


def expected_commission(df: pd.DataFrame, key_col: str, table: pd.DataFrame) -> float:
    """Comisión esperada: cada póliza renueva a la tasa de su segmento en el tramo (o día) indicado."""
    p = _lookup(df, key_col, table).fillna(df["renewed"].mean())
    return float((p * df["potential_commission"]).sum())


def expected_rate(df: pd.DataFrame, key_col: str, table: pd.DataFrame) -> float:
    return float(_lookup(df, key_col, table).mean())


def stratified_late_loss(ren: pd.DataFrame, tarde: pd.DataFrame) -> float:
    """01_eda §8: pérdida por contacto tardío comparando cada póliza con la tasa de referencia (8–20 días) de
    su forma de pago y segmento."""
    ref = ren[ren["lead_bucket"].isin(["8-14", "15-20"])]
    total = 0.0
    for (pago, seg), g in tarde.groupby(["Forma de pago", "Segmento"], observed=True):
        tasa_g = ref.loc[(ref["Forma de pago"] == pago) & (ref["Segmento"] == seg), "renewed"].mean()
        if pd.isna(tasa_g):
            continue
        total += max(0.0, tasa_g - g["renewed"].mean()) * g["potential_commission"].sum()
    return float(total)


@dataclass(frozen=True)
class ImpactNumbers:
    months: int
    potential: float
    collected: float
    collected_rate: float
    expected_real: float
    expected_sim: float
    expected_sim_rate: float
    expected_sim_day: float
    expected_sim_day_rate: float
    out_of_sample_expected: float
    deviation_814: float
    share_g03_814: float
    rate_7g: float
    floor: float
    target: float
    ceiling: float
    ceiling_day: float
    ceiling_7g: float
    ceiling_low: float
    share_window_today: float
    share_window_sim: float
    rate_7g_all: float
    rate_5g_all: float
    gross_drop_month: float
    late_loss_month: float
    automatic_adjustment_month: float


def impact(
    ren: pd.DataFrame,
    r5: pd.DataFrame,
    cola5: pd.DataFrame,
    tasa: pd.DataFrame,
    tasa_dia: pd.DataFrame,
    months_5: int,
    target_window_share: float = TARGET_WINDOW_SHARE,
    automatic_rate: float | None = None,
) -> ImpactNumbers:
    """Celdas 12–13 de §5: comisión real, esperada y rango de ganancia (piso, meta, techo)."""
    real_cobrado = float(cola5["earned_commission"].sum())
    esp_real = expected_commission(cola5, "lead_bucket", tasa)
    esp_sim = expected_commission(cola5, "bucket_simulado", tasa)
    tasa_sim = expected_rate(cola5, "bucket_simulado", tasa)
    esp_sim_dia = expected_commission(cola5, "lead_simulado", tasa_dia)
    tasa_sim_dia = expected_rate(cola5, "lead_simulado", tasa_dia)

    # Referencia del diagnóstico (01_eda §8): pérdida estratificada, periodo de 5 gestores
    tarde5 = ren[ren["lead_bucket"].isin(["Después del venc.", LATE_BUCKET]) & (ren["active_agents"] == 5)]
    perdida_tardia_5_mes = stratified_late_loss(ren, tarde5) / months_5

    # Validación fuera de muestra: la tabla ajustada solo con 7 gestores
    cola7 = ren[(ren["active_agents"] == 7) & (ren["canal"] == CHANNEL_PHONE)]
    tasa7 = rate_table(cola7)
    esp_real_oot = expected_commission(cola5, "lead_bucket", tasa7)
    en_814 = cola5["lead_bucket"] == "8-14"
    earned_814 = float(cola5.loc[en_814, "earned_commission"].sum())
    desvio_814 = (
        expected_commission(cola5[en_814], "lead_bucket", tasa7) / earned_814 - 1 if earned_814 else 0.0
    )
    share_g03_814 = float((cola5.loc[en_814, "Gestor"] == "G03").mean()) if en_814.any() else 0.0
    tasa_7g = float(cola7["renewed"].mean())
    potential = float(cola5["potential_commission"].sum())
    ganancia_piso = (tasa_7g - float(cola5["renewed"].mean())) * potential
    ganancia_techo = esp_sim - esp_real
    ganancia_techo_dia = esp_sim_dia - esp_real
    ganancia_techo_7g = expected_commission(cola5, "bucket_simulado", tasa7) - esp_real_oot
    techo_bajo = min(ganancia_techo_dia, ganancia_techo_7g)
    en_ventana_hoy = float(in_window(cola5["lead_bucket"]).mean())
    en_ventana_sim = float(in_window(cola5["bucket_simulado"]).mean())
    # meta: % en ventana objetivo, interpolando desde hoy (el techo ya descuenta lo que hoy cae en ventana)
    span = en_ventana_sim - en_ventana_hoy
    ganancia_meta = ganancia_techo * (target_window_share - en_ventana_hoy) / span if span > 1e-9 else 0.0
    tasa_ren_7g = float(ren.loc[ren["active_agents"] == 7, "renewed"].mean())
    tasa_ren_5g = float(ren.loc[ren["active_agents"] == 5, "renewed"].mean())
    caida_bruta_mes = (tasa_ren_7g - tasa_ren_5g) * float(r5["potential_commission"].sum()) / months_5

    auto5 = r5[r5["canal"] == CHANNEL_AUTO]
    adjustment = 0.0
    if automatic_rate is not None and len(auto5):
        observed = float(auto5["renewed"].mean())
        adjustment = (automatic_rate - observed) * float(auto5["potential_commission"].sum()) / months_5

    return ImpactNumbers(
        months=months_5,
        potential=potential,
        collected=real_cobrado,
        collected_rate=float(cola5["renewed"].mean()),
        expected_real=esp_real,
        expected_sim=esp_sim,
        expected_sim_rate=tasa_sim,
        expected_sim_day=esp_sim_dia,
        expected_sim_day_rate=tasa_sim_dia,
        out_of_sample_expected=esp_real_oot,
        deviation_814=float(desvio_814),
        share_g03_814=share_g03_814,
        rate_7g=tasa_7g,
        floor=float(ganancia_piso),
        target=float(ganancia_meta),
        ceiling=float(ganancia_techo),
        ceiling_day=float(ganancia_techo_dia),
        ceiling_7g=float(ganancia_techo_7g),
        ceiling_low=float(techo_bajo),
        share_window_today=en_ventana_hoy,
        share_window_sim=en_ventana_sim,
        rate_7g_all=tasa_ren_7g,
        rate_5g_all=tasa_ren_5g,
        gross_drop_month=float(caida_bruta_mes),
        late_loss_month=float(perdida_tardia_5_mes),
        automatic_adjustment_month=float(adjustment),
    )


# --- §7 La cola del día --------------------------------------------------------------------------------------


def daily_queue(
    cola5: pd.DataFrame,
    day: pd.Timestamp,
    mejora: pd.Series,
    open_days: int = OPEN_DAYS,
    deadline_days: int = DEADLINE_DAYS,
    grace_days: int = GRACE_DAYS,
) -> pd.DataFrame:
    """Pólizas pendientes de primer contacto esa mañana, ordenadas por fecha límite y valor."""
    apertura = cola5["Fecha de vencimiento"] - pd.Timedelta(days=open_days)
    pendiente = cola5["primer_contacto_simulado"] >= day
    # Sin cupo en la simulación (capacidad reducida): siguen pendientes mientras no caduquen
    sin_cupo = cola5["primer_contacto_simulado"].isna() & (
        cola5["Fecha de vencimiento"] + pd.Timedelta(days=grace_days) >= day
    )
    cola_dia = cola5[(apertura <= day) & (pendiente | sin_cupo)].copy()
    cola_dia["Días al vencimiento"] = (cola_dia["Fecha de vencimiento"] - day).dt.days
    cola_dia["Días para la fecha límite"] = cola_dia["Días al vencimiento"] - deadline_days
    cola_dia["Mejora esperada"] = cola_dia["Segmento"].map(mejora)
    cola_dia["Score (USD)"] = cola_dia["potential_commission"] * cola_dia["Mejora esperada"]
    cola_dia = cola_dia.sort_values(["Días para la fecha límite", "Score (USD)"], ascending=[True, False])
    return cola_dia.rename(columns={"potential_commission": "Comisión potencial (USD)"})


def queue_csv(cola_dia: pd.DataFrame, day: pd.Timestamp) -> tuple[str, str]:
    """El CSV de la cola, con la misma llamada que el notebook (§7)."""
    table = cola_dia[QUEUE_COLUMNS]
    num = table.select_dtypes("number").columns
    decimales = {c: (4 if c in PCT_COLUMNS else 2) for c in num}
    return (
        f"cola_renovaciones_{day:%Y-%m-%d}.csv",
        table.round(decimales).to_csv(index=False, date_format="%Y-%m-%d"),
    )


# --- §8 Medición y piloto ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class PilotNumbers:
    base_rate: float
    delta: float
    n_per_arm: float
    policies_per_agent_month: float
    policies_per_arm_month: float
    months: float
    agent_rates: dict[str, float]


def pilot_size(cola5: pd.DataFrame, months_5: int, agents: int = AGENTS, delta: float = PILOT_DELTA):
    """¿Cuántos meses hacen falta para detectar una mejora de `delta` en la tasa de la cola telefónica?"""
    p0 = float(cola5["renewed"].mean())
    z_a, z_b = NormalDist().inv_cdf(0.975), NormalDist().inv_cdf(0.80)
    n_brazo = 2 * (z_a + z_b) ** 2 * p0 * (1 - p0) / delta**2  # varianza de la línea base en ambos brazos
    polizas_gestor_mes = len(cola5) / months_5 / agents
    polizas_brazo_mes = len(cola5) / months_5 / 2  # cada gestor reparte sus pólizas al azar entre los brazos
    return PilotNumbers(
        base_rate=p0,
        delta=delta,
        n_per_arm=n_brazo,
        policies_per_agent_month=polizas_gestor_mes,
        policies_per_arm_month=polizas_brazo_mes,
        months=n_brazo / polizas_brazo_mes if polizas_brazo_mes else float("inf"),
        agent_rates={str(k): float(v) for k, v in cola5.groupby("Gestor")["renewed"].mean().items()},
    )


def metrics_rows(
    r5: pd.DataFrame,
    cola5: pd.DataFrame,
    months_5: int,
    agents: int,
    rate_7g: float,
    rate_sim: float,
    target_window_share: float,
) -> list[tuple[str, str, str, str]]:
    """La tabla de §8: métrica, hoy (5 gestores), meta del piloto, frecuencia."""
    p0 = cola5["renewed"].mean()
    auto = r5.loc[r5["canal"] == CHANNEL_AUTO, "renewed"].mean()
    invalid_calls = r5.loc[~r5["valid_phone"], "calls_logged"].sum() / months_5
    return [
        (
            "Anticipación mediana del primer contacto (cola telefónica)",
            f"{cola5['lead_days'].median():.0f} días",
            "≥ 10 días",
            "diaria, por gestor",
        ),
        (
            "% de primeros contactos en la ventana 8-14",
            f"{in_window(cola5['lead_bucket']).mean():.0%}",
            f"≥ {target_window_share:.0%}",
            "semanal",
        ),
        (
            "% de primeros contactos después del vencimiento",
            f"{(cola5['lead_days'] < 0).mean():.1%}",
            "0 %",
            "semanal",
        ),
        (
            "Tasa de renovación, pago manual individual y pyme",
            f"{p0:.1%}",
            f"{rate_7g:.0%} (piso: lo que tuvo con 7 gestores); {rate_sim:.0%} es el techo de la simulación",
            "mensual, por brazo del piloto",
        ),
        (
            "Tasa de renovación del canal automático sin llamada",
            f"{auto:.1%} (hoy, con llamada)",
            "sin caída",
            "mensual",
        ),
        ("Llamadas a teléfonos inválidos", f"{invalid_calls:,.0f} al mes", "0", "mensual"),
        (
            "Comisión cobrada por gestor y mes",
            f"USD {r5['earned_commission'].sum() / months_5 / agents:,.0f}",
            "+10 %",
            "mensual",
        ),
    ]


def is_effective(result: str) -> bool:
    return result in EFFECTIVE_RESULTS
