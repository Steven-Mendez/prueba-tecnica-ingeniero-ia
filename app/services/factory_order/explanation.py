"""Textos para el planificador: «cómo se llega» a cada pedido.

Generaliza la celda 15 de `02_pedido_fabrica`: allá las frases nombran modelos y cifras del ciclo de
octubre de 2026; aquí cada cifra sale del cálculo, así que el texto sigue siendo válido con otro Excel u otros
parámetros. Los textos son de interfaz (español); el código, en inglés.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import pandas as pd

from app.services.factory_order.model import round_to_rules

MONTHS_ES = {
    1: "ene",
    2: "feb",
    3: "mar",
    4: "abr",
    5: "may",
    6: "jun",
    7: "jul",
    8: "ago",
    9: "sep",
    10: "oct",
    11: "nov",
    12: "dic",
}


def fmt_date(ts: pd.Timestamp) -> str:
    """11-feb-2027 (sin depender del locale, como el notebook con MESES_ES)."""
    return f"{ts.day:02d}-{MONTHS_ES[ts.month]}-{ts.year}"


def month_label(ts: pd.Timestamp | pd.Period) -> str:
    return f"{MONTHS_ES[ts.month]}-{ts.year}"


def join_es(items: Iterable[str]) -> str:
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} y {items[-1]}"


def units(x: float) -> str:
    return f"{x:,.0f}"


# Cómo se llega a cada pedido (02 celda 15) -------------------------------------------------------------------


@dataclass(frozen=True)
class Explanation:
    model: str
    case: str  # covered | below_minimum | ordered | forced
    text: str
    computed_order: int  # lo que daba el cálculo antes de forzar el pedido
    rule_warning: str | None


def explain_orders(order: pd.DataFrame, end_of_life: Mapping[str, float]) -> list[Explanation]:
    result = []
    for m, row in order.iterrows():
        pos, dem, ss = row["Posición al llegar"], row["Demanda del horizonte"], row["Stock de seguridad"]
        gross, minimum, lot = row["Pedido bruto"], int(row["Mínimo"]), int(row["Múltiplo"])
        adjustment = float(row.get("Ajuste manual", 0) or 0)
        forced = row.get("Pedido forzado")
        forced = None if forced is None or pd.isna(forced) else int(forced)
        eol = m in end_of_life
        computed = round_to_rules(gross + adjustment, minimum, lot, floor=eol)
        adj_text = (
            f" {'+' if adjustment >= 0 else '−'} ajuste manual {abs(adjustment):.0f}" if adjustment else ""
        )

        if computed == 0:
            if gross + adjustment <= 0:
                case = "covered"
                text = (
                    f"La posición al llegar de {pos:.0f} u. cubre la demanda del horizonte ({dem:.0f} u.) "
                    f"y la seguridad{adj_text}."
                )
            elif eol:
                case = "below_minimum"
                text = (
                    f"Posición {pos:.0f} frente a demanda {dem:.0f}{adj_text}: faltan {gross + adjustment:.0f} u., "
                    f"y redondeando hacia abajo al lote de {lot} no se llega al mínimo de {minimum}."
                )
            else:
                case = "below_minimum"
                text = (
                    f"Posición {pos:.0f} frente a demanda {dem:.0f} + seguridad {ss:.0f}{adj_text}: "
                    f"faltan {gross + adjustment:.0f} u., menos de la mitad del mínimo ({minimum}); pedir el mínimo "
                    f"dejaría ~{minimum - gross - adjustment:.0f} u. sobrantes."
                )
            if eol:
                text += " Última ventana de la generación: sin seguridad y redondeo hacia abajo."
        else:
            case = "ordered"
            transit_h = (
                f" − tránsito en horizonte {row['Tránsito en el horizonte']:.0f}"
                if row["Tránsito en el horizonte"] > 0
                else ""
            )
            text = (
                f"Demanda {dem:.0f} + seguridad {ss:.0f} − posición {pos:.0f}{transit_h}{adj_text} "
                f"= {gross + adjustment:.0f} → {computed} (mín. {minimum}, múltiplo {lot})."
            )
            if row["Sustitución entrante en el hueco"] >= 1:
                text += (
                    f" La posición descuenta {row['Sustitución entrante en el hueco']:.0f} u. de sustitución "
                    "entrante."
                )
            if eol:
                text += " Última ventana de la generación: sin seguridad y redondeo hacia abajo."

        rule_warning = None
        if forced is not None:
            case = "forced"
            text = f"Pedido fijado a mano en {forced} u.; el cálculo daba {computed}. " + text
            if forced != 0 and (forced < minimum or forced % lot != 0):
                rule_warning = (
                    f"{m}: el pedido forzado de {forced} u. no cumple la regla de fábrica "
                    f"(0 o al menos {minimum}, en múltiplos de {lot})."
                )
        result.append(Explanation(str(m), case, text, computed, rule_warning))
    return result
