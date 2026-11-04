"""Textos para el gestor: por qué una póliza va donde va, el mensaje del canal automático y el resumen de la
última interacción. Plantillas deterministas: el asistente las usa como base, no las inventa."""

import pandas as pd

from app.services.factory_order.explanation import fmt_date
from app.services.renewals import engine
from app.services.renewals.cleaning import EFFECTIVE_RESULTS

LINE_LABEL = {"Autos": "de autos", "Médico": "médica", "Vida": "de vida", "Daños / Hogar": "de daños / hogar"}


def _usd(x: float) -> str:
    return f"USD {x:,.0f}"


def explain_policy(row: pd.Series, mejora: pd.Series, open_days: int, deadline_days: int) -> str:
    """Cómo se llega a la prioridad de la póliza (cola telefónica)."""
    venc = row["Fecha de vencimiento"]
    apertura = venc - pd.Timedelta(days=open_days)
    limite = venc - pd.Timedelta(days=deadline_days)
    seg = row["Segmento"]
    uplift = float(mejora.get(seg, 0.0))
    commission = float(row["potential_commission"])
    parts = [
        f"Póliza {row['Póliza']} ({row['Ramo']}, {seg}, pago {str(row['Forma de pago']).lower()}) vence el "
        f"{fmt_date(venc)}: entra a la cola el {fmt_date(apertura)} ({open_days} días antes) y su fecha "
        f"límite de primer contacto es el {fmt_date(limite)} ({deadline_days} días antes, fin de la ventana 8-14).",
        f"Comisión potencial {_usd(commission)} (prima de renovación {_usd(float(row['Prima de renovación (USD)']))} × "
        f"{float(row['% comisión']):.0%}); la prima cambia {float(row['% cambio de prima']):+.1%} frente al periodo anterior.",
        f"Mejora esperada del segmento {seg}: {uplift:+.0%} (tasa en la ventana 8-14 menos tasa a 0-3 días), "
        f"así que el score es {_usd(commission)} × {uplift:.0%} = {_usd(commission * uplift)}. A igual fecha "
        "límite, va antes la de mayor score.",
    ]
    calls = row.get("calls_logged")
    if pd.notna(calls):
        parts.append(
            f"En la bitácora tiene {int(calls)} llamadas; el primer contacto real fue "
            f"{int(row['lead_days'])} días antes del vencimiento ({row['lead_bucket']})."
        )
    return " ".join(parts)


def draft_message(row: pd.Series, kind: str = "whatsapp") -> str:
    """Mensaje de renovación del canal automático (S2.14) para domiciliadas, financiadas y flotas."""
    venc = fmt_date(row["Fecha de vencimiento"])
    line = LINE_LABEL.get(str(row["Ramo"]), str(row["Ramo"]).lower())
    prev, new = float(row["Prima anterior (USD)"]), float(row["Prima de renovación (USD)"])
    change = float(row["% cambio de prima"])
    pago = str(row["Forma de pago"])
    if pago == "Domiciliado":
        how = "Si está de acuerdo, no tiene que hacer nada: el cargo automático se renueva solo."
    elif pago == "Financiado":
        how = "La póliza está ligada a su crédito, así que la renovación se aplica con la próxima cuota."
    else:
        how = "Responda este mensaje o llámenos y le enviamos la cotización por escrito."
    change_txt = (
        f"se mantiene en {_usd(new)}"
        if abs(change) < 0.005
        else f"pasa de {_usd(prev)} a {_usd(new)} ({change:+.1%})"
    )
    body = (
        f"Hola, le escribe Capesa. Su póliza {line} {row['Póliza']} con {row['Aseguradora']} vence el {venc}. "
        f"La prima anual de renovación {change_txt}. {how} "
        "Si prefiere revisar opciones o cambiar de aseguradora, responda «hablar» y un gestor lo llama. Gracias por confiar en nosotros."
    )
    if kind == "correo":
        return f"Asunto: Renovación de su póliza {row['Póliza']} · vence el {venc}\n\n{body}"
    return body


def interaction_summary(row: pd.Series, calls: pd.DataFrame, contacts: list[dict]) -> dict:
    """Secuencia de intentos (bitácora y registros de la app) y siguiente paso sugerido antes de volver a llamar."""
    attempts = [
        {
            "fecha": c["Fecha y hora"].isoformat(),
            "gestor": c["Gestor"],
            "resultado": c["Resultado"],
            "duracion_seg": int(c["Duración (seg)"]),
            "efectiva": bool(c["Resultado"] in EFFECTIVE_RESULTS),
        }
        for c in calls.sort_values("Fecha y hora").to_dict("records")
    ]
    logged = [
        {"fecha": c["day"], "gestor": c["agent"], "resultado": c["result"], "nota": c["note"], "en_app": True}
        for c in sorted(contacts, key=lambda c: c["created_at"])
    ]
    last = logged[-1]["resultado"] if logged else attempts[-1]["resultado"] if attempts else None
    effective = sum(a["efectiva"] for a in attempts) + sum(
        engine.is_effective(c["resultado"]) for c in logged
    )
    if last == "Cierre":
        next_step = "Renovación cerrada: no hace falta llamar."
    elif last == "Cotización enviada":
        next_step = "Tiene la cotización: llamar para resolver dudas y cerrar; mencionar el cambio de prima."
    elif last == "Pide llamar después":
        next_step = "Pidió que lo llamaran después: retomar la conversación donde quedó."
    elif last == "Número equivocado":
        next_step = "Número equivocado: confirmar el teléfono antes de volver a marcar (corrección de datos)."
    elif last == "No contesta":
        next_step = (
            "No contestó: intentar de nuevo; si tampoco contesta, enviar mensaje por WhatsApp o correo."
        )
    elif last == "Contactado":
        next_step = "Ya se habló con el cliente: enviar la cotización y agendar el cierre."
    else:
        next_step = "Sin intentos previos: primera llamada, presentar la renovación y el cambio de prima."
    return {
        "poliza": row["Póliza"],
        "cliente": row["ID cliente"],
        "telefono": None if pd.isna(row["Teléfono cliente"]) else row["Teléfono cliente"],
        "vence": row["Fecha de vencimiento"].date().isoformat(),
        "intentos_bitacora": attempts,
        "registros_app": logged,
        "contactos_efectivos": int(effective),
        "ultimo_resultado": last,
        "renovo": bool(row["renewed"] == 1),
        "siguiente_paso": next_step,
    }
