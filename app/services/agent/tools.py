"""Herramientas del asistente: envuelven el motor del planificador, el tablero de ventas y las hojas de datos.

El agente no calcula nada: cada herramienta llama al mismo motor determinista que usa la pantalla
(`calculation`, `tracking`, `sales`, `explorer`) y devuelve un JSON compacto que el modelo resume. Dos de ellas
no leen datos sino que dejan una acción para el frontend (cambiar los supuestos en pantalla o abrir una sección)
y una tercera un gráfico; el router las envía como eventos del stream.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

from langchain.tools import tool
from pydantic import ValidationError

from app.schemas import factory_order as s
from app.services.agent.common_tools import (
    MAX_ROWS,
    AgentSpec,
    ToolError,
    _dump,
    _r,
    chart_tool,
    sheet_rows,
)
from app.services.factory_order import calculation, explorer, plans, sales, tracking
from app.services.factory_order.base import DataError
from app.services.factory_order.source import LoadedDataset

__all__ = ["APPROVAL_TOOLS", "SYSTEM_PROMPT", "ToolContext", "ToolError", "build_tools", "spec"]

PLANNER_TABS = ("pedido", "demanda", "sensibilidad", "versiones", "ciclo")
SECTIONS = ("planificador", "seguimiento", "ventas", "datos", "inicio")

# Campos de Parameters que el agente puede cambiar (los demás, como la ventana, se eligen en pantalla)
ASSUMPTION_FIELDS = {
    "lead_time_days",
    "late_share",
    "late_delay_months",
    "demand_window_months",
    "demand_multiplier",
    "demand_in_stock_months_only",
    "substitution_in_gap",
    "learned_correction",
    "safety_months",
    "safety_sigma",
    "leftover_extra_months",
    "leftover_discount",
    "end_of_life",
    "cutoff_date",
    "window_close",
    "overrides",
}


@dataclass
class ToolContext:
    """Estado de una conversación: la fuente, lo que el planificador tiene en pantalla y lo que el agente dejó para la UI."""

    dataset: LoadedDataset
    parameters: s.Parameters
    plans: list[dict] = field(default_factory=list)
    store: plans.PlanStore | None = None
    actions: list[dict[str, Any]] = field(default_factory=list)
    charts: list[dict[str, Any]] = field(default_factory=list)
    _results: dict[str, s.CalculationResult] = field(default_factory=dict)
    _defaults: s.ParameterDefaults | None = None

    def defaults(self) -> s.ParameterDefaults:
        if self._defaults is None:
            self._defaults = calculation.parameter_defaults(self.dataset)
        return self._defaults

    def calculate(self, p: s.Parameters | None = None) -> s.CalculationResult:
        p = p or self.parameters
        key = p.model_dump_json()
        if key not in self._results:
            self._results[key] = calculation.calculate(self.dataset, p, self.plans)
        return self._results[key]

    def merged(self, changes: dict[str, Any] | None) -> s.Parameters:
        """Los parámetros en pantalla más `changes` (los overrides se combinan modelo por modelo)."""
        if not changes:
            return self.parameters
        unknown = sorted(set(changes) - ASSUMPTION_FIELDS)
        if unknown:
            raise ToolError(
                f"Campos desconocidos: {', '.join(unknown)}. Válidos: {', '.join(sorted(ASSUMPTION_FIELDS))}."
            )
        data = self.parameters.model_dump(mode="json")
        overrides = dict(data.get("overrides") or {})
        for model, patch in (changes.get("overrides") or {}).items():
            if patch is None:
                overrides.pop(model, None)
            else:
                overrides[model] = {**overrides.get(model, {}), **patch}
        data.update({k: v for k, v in changes.items() if k != "overrides"})
        data["overrides"] = overrides
        try:
            return s.Parameters.model_validate(data)
        except ValidationError as exc:
            raise ToolError(
                f"Parámetros inválidos: {exc.errors()[0]['msg']} ({'.'.join(map(str, exc.errors()[0]['loc']))})"
            ) from None


def _order_summary(result: s.CalculationResult) -> dict[str, Any]:
    k, c = result.kpis, result.calendar
    return {
        "ventana": c.window_label,
        "corte": str(c.cutoff_date),
        "llegada": str(c.arrival),
        "horizonte": c.horizon_label,
        "hueco_meses": _r(c.gap_months),
        "horizonte_meses": _r(c.horizon_months),
        "total_unidades": k.total_units,
        "capital_usd": _r(k.capital_usd, 0),
        "pedido_ventana_anterior": k.previous_window_units,
        "modelos_en_cero": k.zero_order_models,
        "venta_no_atendible_en_hueco": _r(k.unmet_gap_demand, 0),
        "unidades_mas_180_dias": k.units_over_180_days,
        "stock_seguridad_total": _r(k.total_safety_stock, 0),
        "coincide_con_notebook": result.notebook_check.matches if result.notebook_check else None,
        "pedido_por_modelo": [
            {
                "modelo": o.model,
                "pedido": o.order,
                "ventana_anterior": o.previous_window_order,
                "demanda_mensual": _r(o.monthly_demand),
                "posicion_al_llegar": _r(o.position_at_arrival, 0),
                "demanda_horizonte": _r(o.horizon_demand, 0),
                "seguridad": _r(o.safety_stock, 0),
                "cobertura_hoy_meses": _r(o.coverage_today_months),
                "capital_usd": _r(o.capital_usd, 0),
                **({"fijado_a_mano": o.forced_order} if o.forced_order is not None else {}),
                **({"ajuste_manual": o.manual_adjustment} if o.manual_adjustment else {}),
            }
            for o in result.order
        ],
        "como_se_llega": {e.model: e.text for e in result.explanations},
        "avisos": result.warnings,
    }


def _assumptions(
    result: s.CalculationResult, p: s.Parameters, defaults: s.ParameterDefaults
) -> list[dict[str, Any]]:
    """Los supuestos del cálculo en lenguaje de negocio: valor usado, valor por defecto, qué significa y si el
    planificador lo cambió. Es lo que el agente debe explicar junto al pedido."""
    d, base = result.derived, defaults.parameters

    def pct(x: float | None) -> str:
        return "—" if x is None else f"{x * 100:.1f} %"

    def months(x: float) -> str:
        return f"{x:g} meses"

    rows = [
        (
            "Lead time",
            f"{d.lead_time_days} días",
            f"{defaults.derived.lead_time_days} días (observado)",
            f"Días del cierre de ventana a la llegada del pedido. Observado en la hoja Pedidos: {defaults.derived.lead_time_days}; el comunicado dice {d.communicated_lead_time_days}. Fija el hueco que cubren stock y tránsito.",
            p.lead_time_days is not None and p.lead_time_days != defaults.derived.lead_time_days,
        ),
        (
            "Llegadas tardías",
            pct(d.late_share),
            f"{pct(defaults.derived.late_share)} (observado)",
            "Fracción del pedido que llega uno o dos meses tarde; suma una reserva al stock de seguridad.",
            p.late_share is not None and abs(p.late_share - defaults.derived.late_share) > 1e-9,
        ),
        (
            "Retraso de las tardías",
            months(p.late_delay_months),
            months(base.late_delay_months),
            "Cuántos meses tarde llega esa fracción.",
            p.late_delay_months != base.late_delay_months,
        ),
        (
            "Ajuste de demanda",
            f"{(p.demand_multiplier - 1) * 100:+.0f} %",
            f"{(base.demand_multiplier - 1) * 100:+.0f} %",
            "Multiplica la demanda de todos los modelos (sensibilidad).",
            p.demand_multiplier != base.demand_multiplier,
        ),
        (
            "Meses de historia",
            months(p.demand_window_months),
            months(base.demand_window_months),
            "Meses de venta con los que se estima la demanda mensual.",
            p.demand_window_months != base.demand_window_months,
        ),
        (
            "Demanda en meses sin stock",
            "promedio de meses con stock"
            if p.demand_in_stock_months_only
            else "venta + leads perdidos + sustituciones",
            "promedio de meses con stock"
            if base.demand_in_stock_months_only
            else "venta + leads perdidos + sustituciones",
            "Cómo se corrige la venta censurada de los modelos que estuvieron en cero.",
            p.demand_in_stock_months_only != base.demand_in_stock_months_only,
        ),
        (
            "Sustitución en el hueco",
            "activa" if p.substitution_in_gap else "apagada",
            "activa" if base.substitution_in_gap else "apagada",
            "Mientras un modelo siga en cero, sus clientes compran otro (RAV4 y Raize reciben a Corolla Cross y Rush); se descuenta de la posición del que recibe.",
            p.substitution_in_gap != base.substitution_in_gap,
        ),
        (
            "Corrección aprendida",
            "activa" if p.learned_correction else "apagada",
            "activa" if base.learned_correction else "apagada",
            "Corrige la demanda de cada modelo con su sesgo en los ciclos ya cerrados (acotado a ±25 %).",
            p.learned_correction != base.learned_correction,
        ),
        (
            "Fin de generación",
            ", ".join(f"{m} liquidación {v * 100:.0f} %" for m, v in d.end_of_life.items()) or "ninguno",
            ", ".join(f"{m} liquidación {v * 100:.0f} %" for m, v in defaults.derived.end_of_life.items())
            or "ninguno",
            "Modelos en su última ventana: sin stock de seguridad, redondeo hacia abajo y descuento de liquidación.",
            p.end_of_life is not None and p.end_of_life != defaults.derived.end_of_life,
        ),
        (
            "Meses extra del sobrante",
            months(p.leftover_extra_months),
            months(base.leftover_extra_months),
            "Meses de plan piso que cuesta una unidad que sobra; con el descuento, define el costo de sobrar.",
            p.leftover_extra_months != base.leftover_extra_months,
        ),
        (
            "Descuento del sobrante",
            pct(p.leftover_discount),
            pct(base.leftover_discount),
            "Descuento por antigüedad con el que se vende lo que sobra.",
            p.leftover_discount != base.leftover_discount,
        ),
        (
            "Meses que cubre la seguridad",
            "solo el horizonte" if p.safety_months == "horizon" else "hueco + horizonte",
            "solo el horizonte" if base.safety_months == "horizon" else "hueco + horizonte",
            "Sobre qué periodo se mide la incertidumbre para el stock de seguridad.",
            p.safety_months != base.safety_months,
        ),
        (
            "Variabilidad de la demanda",
            "con estacionalidad" if p.safety_sigma == "adjusted" else "sin estacionalidad",
            "con estacionalidad" if base.safety_sigma == "adjusted" else "sin estacionalidad",
            "Si la desviación mensual incluye o no la estacionalidad.",
            p.safety_sigma != base.safety_sigma,
        ),
    ]
    out = [
        {"supuesto": n, "valor": v, "por_defecto": dv, "cambiado": bool(c), "que_significa": e}
        for n, v, dv, e, c in rows
    ]
    for model, o in p.overrides.items():
        parts = []
        if o.forced_order is not None:
            parts.append(f"pedido fijado en {o.forced_order}")
        if o.manual_adjustment:
            parts.append(f"ajuste manual {o.manual_adjustment:+d}")
        if o.rule:
            parts.append(f"regla de fábrica {o.rule.min_order}/{o.rule.lot_multiple}")
        if parts:
            out.append(
                {
                    "supuesto": f"Ajuste por modelo: {model}",
                    "valor": ", ".join(parts),
                    "por_defecto": "sin ajuste",
                    "cambiado": True,
                    "que_significa": "Lo que los datos no saben, puesto a mano por el planificador.",
                }
            )
    return out


def _changes_vs(base: s.Parameters, current: s.Parameters) -> dict[str, Any]:
    b, c = base.model_dump(mode="json"), current.model_dump(mode="json")
    return {k: {"antes": b[k], "ahora": c[k]} for k in c if b.get(k) != c[k]}


def build_tools(ctx: ToolContext) -> list:
    """Las herramientas de una conversación, cerradas sobre su contexto."""

    @tool
    def contexto() -> str:
        """Qué está viendo el planificador ahora: ventana que se planifica, calendario del ciclo, parámetros
        derivados de los datos (lead time, llegadas tardías, fin de generación), supuestos cambiados frente a los
        valores por defecto, totales del pedido actual, catálogo de modelos con sus reglas de fábrica y ventanas
        disponibles. Llámala primero cuando necesites saber en qué situación está el usuario."""
        d = ctx.defaults()
        result = ctx.calculate()
        return _dump(
            {
                "fecha_corte_datos": str(d.derived.cutoff_date),
                "ventana": result.calendar.window_label,
                "tipo_ventana": result.window_kind,
                "calendario": {
                    "cierre_ventana": str(result.calendar.window_close),
                    "llegada_pedido": str(result.calendar.arrival),
                    "siguiente_llegada": str(result.calendar.next_arrival),
                    "hueco_meses": _r(result.calendar.gap_months),
                    "horizonte": result.calendar.horizon_label,
                },
                "derivados": {
                    "lead_time_dias": result.derived.lead_time_days,
                    "lead_time_comunicado_dias": result.derived.communicated_lead_time_days,
                    "fraccion_tardias": _r(result.derived.late_share, 3),
                    "fin_de_generacion": result.derived.end_of_life,
                    "fuentes": result.derived.sources,
                },
                "supuestos_usados": _assumptions(result, ctx.parameters, d),
                "supuestos_en_pantalla": ctx.parameters.model_dump(mode="json"),
                "cambios_frente_a_defecto": _changes_vs(d.parameters, ctx.parameters),
                "pedido_actual": {
                    "total_unidades": result.kpis.total_units,
                    "capital_usd": _r(result.kpis.capital_usd, 0),
                    "por_modelo": {o.model: o.order for o in result.order},
                },
                "correccion_aprendida": result.correction.model_dump(),
                "catalogo": {
                    "modelos": d.catalog.models,
                    "reglas_fabrica": {m: r.model_dump() for m, r in d.catalog.rules.items()},
                    "versiones_por_modelo": d.catalog.versions_by_model,
                },
                "ventanas_disponibles": [o.model_dump(mode="json") for o in d.cutoff_options],
                "planes_guardados_en_esta_ventana": [p.model_dump(mode="json") for p in result.window_plans],
            }
        )

    @tool
    def calcular_pedido(cambios: dict[str, Any] | None = None) -> str:
        """Calcula el pedido con los supuestos en pantalla más `cambios`, SIN tocar la pantalla (para explorar
        escenarios y responder «qué pasaría si»). `cambios` admite: demand_multiplier (1.2 = demanda +20 %),
        lead_time_days, late_share, late_delay_months, demand_window_months, demand_in_stock_months_only,
        substitution_in_gap, learned_correction, safety_months ("horizon"|"gap_plus_horizon"), safety_sigma
        ("adjusted"|"deseasonalized"), leftover_extra_months, leftover_discount, end_of_life ({modelo: descuento}),
        cutoff_date y window_close (YYYY-MM-DD, de ventanas_disponibles) y overrides
        ({modelo: {"forced_order": n, "manual_adjustment": n, "rule": {"min_order": n, "lot_multiple": n}}}).
        Devuelve totales, pedido por modelo, cómo se llega a cada cifra y la diferencia frente al pedido en pantalla."""
        p = ctx.merged(cambios)
        result = ctx.calculate(p)
        out = _order_summary(result)
        out["supuestos_usados"] = _assumptions(result, p, ctx.defaults())
        if cambios:
            current = ctx.calculate()
            out["cambios_aplicados"] = _changes_vs(ctx.parameters, p)
            out["diferencia_frente_a_pantalla"] = {
                "total_unidades": result.kpis.total_units - current.kpis.total_units,
                "capital_usd": _r(result.kpis.capital_usd - current.kpis.capital_usd, 0),
                "por_modelo": {
                    o.model: o.order - cur
                    for o in result.order
                    if (cur := next(c.order for c in current.order if c.model == o.model)) != o.order
                },
            }
        return _dump(out)

    @tool
    def aplicar_supuestos(cambios: dict[str, Any]) -> str:
        """Aplica `cambios` a los supuestos del planificador EN PANTALLA (mismo formato que calcular_pedido): el
        pedido se recalcula ahí y el usuario lo ve. Úsala solo cuando el usuario pida cambiar, ajustar, fijar o
        activar algo; para explorar usa calcular_pedido. No guarda ningún plan."""
        if not cambios:
            raise ToolError("Indica qué cambiar.")
        before = ctx.calculate()
        p = ctx.merged(cambios)
        result = ctx.calculate(p)
        ctx.parameters = p
        ctx.actions.append({"action": "set_parameters", "parameters": p.model_dump(mode="json")})
        return _dump(
            {
                "aplicado": True,
                "cambios": _changes_vs(before.parameters, p),
                "antes": {
                    "total_unidades": before.kpis.total_units,
                    "capital_usd": _r(before.kpis.capital_usd, 0),
                },
                "ahora": _order_summary(result),
            }
        )

    @tool
    def restablecer_supuestos() -> str:
        """Vuelve a los valores por defecto (los del notebook) en pantalla, conservando la ventana elegida.
        Quita también los ajustes por modelo."""
        d = ctx.defaults()
        p = d.parameters.model_copy(
            update={"cutoff_date": ctx.parameters.cutoff_date, "window_close": ctx.parameters.window_close}
        )
        ctx.parameters = p
        ctx.actions.append({"action": "set_parameters", "parameters": p.model_dump(mode="json")})
        result = ctx.calculate(p)
        return _dump({"restablecido": True, "ahora": _order_summary(result)})

    @tool
    def explicar_modelo(modelo: str) -> str:
        """Cómo se llega al pedido de un modelo con los supuestos en pantalla: demanda ajustada (venta +
        leads perdidos + sustituciones), posición al llegar el pedido, stock de seguridad y nivel de servicio,
        redondeo a las reglas de fábrica, mezcla por versión, sustituciones con otros modelos, su pedido en cada
        escenario de sensibilidad y su historia mensual (venta, demanda ajustada, stock, meses en cero)."""
        result = ctx.calculate()
        names = {o.model.lower(): o.model for o in result.order}
        if modelo.lower() not in names:
            raise ToolError(f"Modelo desconocido «{modelo}». Modelos: {', '.join(names.values())}.")
        m = names[modelo.lower()]
        order = next(o for o in result.order if o.model == m)
        demand = next(d for d in result.demand if d.model == m)
        econ = next(e for e in result.economics if e.model == m)
        history = next(h for h in result.history if h.model == m)
        return _dump(
            {
                "modelo": m,
                "como_se_llega": next(e.text for e in result.explanations if e.model == m),
                "caso": next(e.case for e in result.explanations if e.model == m),
                "pedido": {k: _r(v) for k, v in order.model_dump().items() if k != "model"},
                "demanda": {k: _r(v) for k, v in demand.model_dump().items() if k != "model"},
                "economia": {k: _r(v, 3) for k, v in econ.model_dump().items() if k != "model"},
                "mezcla_por_version": [
                    {k: _r(v) for k, v in r.model_dump().items() if k != "model"}
                    for r in result.versions
                    if r.model == m
                ],
                "versiones_cubiertas_sin_pedido": [
                    {k: _r(v) for k, v in r.model_dump().items() if k != "model"}
                    for r in result.covered_versions
                    if r.model == m
                ],
                "sustituciones": [
                    p.model_dump() for p in result.substitutions if m in (p.wanted_model, p.bought_model)
                ],
                "pedido_en_cada_escenario": {
                    sc.name: sc.orders.get(m) for sc in result.sensitivity.scenarios
                },
                "historia_mensual": [
                    {
                        "mes": pt.month,
                        "venta": _r(pt.sales, 0),
                        "demanda_ajustada": _r(pt.adjusted_demand, 0),
                        "stock_fin_mes": _r(pt.stock_end, 0),
                        "en_cero": pt.stockout,
                        "perdidos_sin_disponibilidad": _r(pt.lost_no_availability, 0),
                    }
                    for pt in history.points
                ],
            }
        )

    @tool
    def sensibilidad() -> str:
        """Los escenarios de sensibilidad del pedido en pantalla (demanda ±20 %, demanda solo de meses con
        stock, lead time del comunicado, sin sustitución, variantes del stock de seguridad): total y pedido por
        modelo en cada uno, rango del total y modelo más sensible."""
        result = ctx.calculate()
        sens = result.sensitivity
        return _dump(
            {
                "total_min": sens.total_min,
                "total_max": sens.total_max,
                "modelo_mas_sensible": sens.most_sensitive_model,
                "escenarios": [
                    {
                        "escenario": sc.name,
                        "descripcion": sc.description,
                        "total_unidades": sc.total_units,
                        "capital_usd": _r(sc.capital_usd, 0),
                        "igual_al_actual": sc.same_as_current,
                        "por_modelo": sc.orders,
                    }
                    for sc in sens.scenarios
                ],
            }
        )

    @tool
    def precision() -> str:
        """Seguimiento de ciclos pasados: para cada ventana cerrada, demanda que habría proyectado la herramienta
        frente a la real, pedido de la herramienta frente al real, error (WAPE) y sesgo; precisión y corrección
        aprendida por modelo; y cuánto cambiaría el pedido actual si se aplicara esa corrección."""
        acc = tracking.accuracy(ctx.dataset)
        with_corr = ctx.calculate(ctx.merged({"learned_correction": True}))
        current = ctx.calculate()
        return _dump(
            {
                "ciclos_medidos": len(acc.cycles),
                "error_wape": _r(acc.wape, 3),
                "sesgo": _r(acc.bias, 3),
                "proximo_ciclo_medible": str(acc.next_cycle_closes) if acc.next_cycle_closes else None,
                "ciclos": [
                    {
                        "ventana": c.window_label,
                        "horizonte": c.horizon_label,
                        "demanda_proyectada": _r(c.projected, 0),
                        "demanda_real": _r(c.realized, 0),
                        "venta_registrada": _r(c.realized_sales, 0),
                        "pedido_herramienta": c.tool_order,
                        "pedido_real": c.actual_order,
                        "wape": _r(c.wape, 3),
                        "sesgo": _r(c.bias, 3),
                    }
                    for c in acc.cycles
                ],
                "por_modelo": [{k: _r(v, 3) for k, v in m.model_dump().items()} for m in acc.models],
                "pedido_con_correccion_aprendida": {
                    "aplicada_en_pantalla": current.correction.applied,
                    "total_unidades": with_corr.kpis.total_units,
                    "capital_usd": _r(with_corr.kpis.capital_usd, 0),
                    "diferencia_por_modelo": {
                        o.model: o.order - cur
                        for o in with_corr.order
                        if (cur := next(c.order for c in current.order if c.model == o.model)) != o.order
                    },
                },
            }
        )

    @tool
    def ventas(
        date_from: date | None = None,
        date_to: date | None = None,
        modelos: list[str] | None = None,
        sucursales: list[str] | None = None,
        tipos_cliente: list[str] | None = None,
        incluir_flotas: bool = False,
    ) -> str:
        """Tablero de ventas: unidades netas, ingresos, venta perdida por disponibilidad y comparación con el año
        anterior, por mes, modelo, sucursal y tipo de cliente, más versiones y vendedores principales. Sin fechas,
        los últimos 12 meses. Devuelve también los valores válidos de cada filtro (opciones)."""
        try:
            ov = sales.overview(
                ctx.dataset, date_from, date_to, modelos, sucursales, tipos_cliente, incluir_flotas
            )
        except DataError as exc:
            raise ToolError(exc.detail) from None

        def group(rows, top=None):
            return [
                {
                    "clave": g.label,
                    "unidades": g.units,
                    "ingresos_usd": _r(g.revenue_usd, 0),
                    "participacion": _r(g.share, 3),
                    "unidades_ano_anterior": g.units_prev_year,
                }
                for g in (rows[:top] if top else rows)
            ]

        return _dump(
            {
                "filtros": ov.filters.model_dump(mode="json"),
                "opciones": ov.options.model_dump(mode="json"),
                "kpis": {k: _r(v, 0) for k, v in ov.kpis.model_dump().items()},
                "por_mes": [
                    {
                        "mes": m.month,
                        "unidades": m.units,
                        "ingresos_usd": _r(m.revenue_usd, 0),
                        "perdidas": m.lost_units,
                        "unidades_ano_anterior": m.units_prev_year,
                    }
                    for m in ov.monthly
                ],
                "por_modelo": group(ov.by_model),
                "por_sucursal": group(ov.by_branch),
                "por_tipo_cliente": group(ov.by_customer_type),
                "versiones_principales": group(ov.top_versions, 10),
                "vendedores_principales": group(ov.top_sellers, 5),
            }
        )

    @tool
    def consultar_hoja(
        hoja: Literal["sales", "inventory", "leads", "orders", "economics", "communications"],
        buscar: str = "",
        modelo: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        ordenar_por: str | None = None,
        descendente: bool = False,
        limite: int = 20,
    ) -> str:
        """Filas de una hoja de datos ya limpia (sales = facturas, inventory = cierre mensual por modelo/versión/
        color, leads = oportunidades del CRM con motivo de pérdida, orders = pedidos a fábrica con ETA y estado,
        economics = margen y costos por modelo, communications = comunicados de fábrica y gerencia). `buscar`
        busca texto en cualquier columna; `ordenar_por` es la clave de una columna. Máximo 50 filas por llamada."""
        try:
            page = explorer.sheet_page(
                ctx.dataset,
                hoja,
                page=1,
                page_size=max(1, min(limite, MAX_ROWS)),
                q=buscar,
                model=modelo,
                date_from=date_from,
                date_to=date_to,
                sort=ordenar_por,
                desc=descendente,
            )
        except DataError as exc:
            raise ToolError(exc.detail) from None
        return _dump(sheet_rows(page))

    def _store() -> plans.PlanStore:
        if ctx.store is None:
            raise ToolError("Los planes guardados no están disponibles en este contexto.")
        return ctx.store

    def _plan_summary(record: dict) -> dict[str, Any]:
        p = plans.to_schema(ctx.dataset, record)
        return {
            "id": p.id,
            "nombre": p.name,
            "nota": p.note,
            "estado": p.status,
            "ventana": p.window_label,
            "horizonte": p.horizon_label,
            "total_unidades": p.total_units,
            "capital_usd": _r(p.capital_usd, 0),
            "creado": p.created_at.isoformat(),
            "seguimiento": {
                "estado": p.tracking.state,
                "fraccion_horizonte_en_datos": _r(p.tracking.elapsed_share, 2),
                "demanda_proyectada": _r(p.tracking.projected, 0),
                "demanda_real": _r(p.tracking.realized, 0),
                "wape": _r(p.tracking.wape, 3),
            },
            "pedido_por_modelo": {r.model: r.order for r in p.rows},
        }

    @tool
    def listar_planes() -> str:
        """Los planes guardados (pedidos decididos) con su ventana, estado (draft = borrador, sent = enviado a
        fábrica), totales y seguimiento frente a la demanda real. Úsala antes de cambiar el estado o borrar."""
        return _dump({"planes": [_plan_summary(r) for r in _store().list()]})

    @tool
    def guardar_plan(nombre: str, nota: str = "") -> str:
        """Guarda el pedido con los supuestos EN PANTALLA como un plan (borrador) en Seguimiento: es la decisión
        del planificador, así que requiere su aprobación antes de ejecutarse. Resume en `nota` qué supuestos o
        ajustes lleva. Para marcarlo como enviado a fábrica usa cambiar_estado_plan después."""
        if not nombre.strip():
            raise ToolError("Indica un nombre para el plan.")
        try:
            record = _store().create(
                ctx.dataset, s.PlanCreate(name=nombre[:120], note=nota[:2000], parameters=ctx.parameters)
            )
        except DataError as exc:
            raise ToolError(exc.detail) from None
        ctx.plans = _store().list()
        ctx.actions.append({"action": "plans_changed", "plan_id": record["id"], "plan_name": record["name"]})
        return _dump({"guardado": True, "plan": _plan_summary(record)})

    @tool
    def cambiar_estado_plan(plan_id: str, estado: Literal["draft", "sent"]) -> str:
        """Marca un plan guardado como enviado a fábrica (sent) o lo devuelve a borrador (draft). Requiere la
        aprobación del planificador."""
        try:
            record = _store().update(plan_id, s.PlanUpdate(status=estado))
        except DataError as exc:
            raise ToolError(exc.detail) from None
        ctx.actions.append({"action": "plans_changed", "plan_id": record["id"], "plan_name": record["name"]})
        return _dump({"actualizado": True, "plan": _plan_summary(record)})

    @tool
    def borrar_plan(plan_id: str) -> str:
        """Borra un plan guardado. Requiere la aprobación del planificador; no se puede deshacer."""
        try:
            record = _store().get(plan_id)
            _store().delete(plan_id)
        except DataError as exc:
            raise ToolError(exc.detail) from None
        ctx.plans = _store().list()
        ctx.actions.append({"action": "plans_changed", "plan_id": plan_id, "plan_name": record["name"]})
        return _dump({"borrado": True, "plan_id": plan_id, "nombre": record["name"]})

    @tool
    def exportar_csv(tabla: Literal["model", "version"]) -> str:
        """Descarga en el navegador el CSV del pedido con los supuestos en pantalla, por modelo (model) o por
        versión (version): los mismos archivos que exporta el notebook."""
        ctx.actions.append({"action": "download_csv", "table": tabla})
        return _dump({"descarga_iniciada": tabla})

    @tool
    def mostrar(
        seccion: Literal["planificador", "seguimiento", "ventas", "datos", "inicio"],
        pestana: str | None = None,
    ) -> str:
        """Abre una sección de la app para el usuario. En planificador, `pestana` puede ser pedido, demanda,
        sensibilidad, versiones o ciclo; en datos, la hoja (sales, inventory, leads, orders, economics,
        communications). Úsala cuando el usuario pida ver algo que ya existe en pantalla."""
        if seccion == "planificador":
            if pestana and pestana not in PLANNER_TABS:
                raise ToolError(f"Pestañas del planificador: {', '.join(PLANNER_TABS)}.")
            path = f"planificador/{pestana or 'pedido'}"
        elif seccion == "datos":
            if pestana and pestana not in explorer.SHEETS:
                raise ToolError(f"Hojas: {', '.join(explorer.SHEETS)}.")
            path = f"datos/{pestana}" if pestana else "datos"
        else:
            path = seccion
        ctx.actions.append({"action": "navigate", "path": path})
        return _dump({"abierto": path})

    grafico = chart_tool(ctx)

    return [
        contexto,
        calcular_pedido,
        aplicar_supuestos,
        restablecer_supuestos,
        explicar_modelo,
        sensibilidad,
        precision,
        ventas,
        consultar_hoja,
        listar_planes,
        guardar_plan,
        cambiar_estado_plan,
        borrar_plan,
        exportar_csv,
        mostrar,
        grafico,
    ]


# Herramientas que piden aprobación antes de ejecutarse
APPROVAL_TOOLS = ("guardar_plan", "cambiar_estado_plan", "borrar_plan")

SYSTEM_PROMPT = """Eres el asistente del planificador de pedidos a fábrica de Casa Pellas (prototipo de una prueba técnica; todos los datos son ficticios). Ayudas al planificador a obtener y resumir los datos, correr escenarios y explicar cada cifra; la decisión es suya.

Reglas:
- Todas las cifras salen de las herramientas. Nunca inventes ni estimes de memoria: si no tienes el dato, llama a la herramienta. Si no sabes qué está viendo el usuario, empieza por `contexto`.
- El pedido lo calcula un modelo determinista (demanda ajustada por los meses en cero, posición de inventario al llegar el pedido, stock de seguridad según el margen de cada modelo y redondeo a los mínimos y múltiplos de fábrica). Tú no calculas: operas la herramienta y explicas.
- `aplicar_supuestos` cambia lo que el usuario ve; úsala solo cuando pida explícitamente cambiar, fijar o activar algo. Para explorar o comparar usa `calcular_pedido`.
- Guardar un plan, marcarlo como enviado o borrarlo son decisiones del planificador: las herramientas `guardar_plan`, `cambiar_estado_plan` y `borrar_plan` se detienen y piden su aprobación antes de ejecutarse. Antes de guardar, resume en una frase qué pedido y supuestos se van a guardar. Si rechaza, no insistas.
- Cuando el usuario pida ver o comparar, usa `grafico` con datos que ya obtuviste, o `mostrar` para abrir la pantalla que ya lo muestra. No dibujes gráficos con datos que no hayas pedido a una herramienta.
- Responde en español, breve y concreto: cifras con unidad (unidades, USD, meses, %), listas cortas, negritas con moderación. Para datos por modelo o por mes usa una tabla Markdown. Di en una frase qué cambiaste en pantalla o qué abriste. Nombra los modelos como en el catálogo.
- Cuando una cifra dependa de un supuesto, dilo (por ejemplo, la demanda de los modelos en cero es estimada).
- Si preguntan cuál debería ser el pedido a fábrica del próximo ciclo (o el pedido recomendado), llama a `contexto` y a `calcular_pedido` y responde como una recomendación a la gerencia: total de unidades y capital, una tabla Markdown por modelo (modelo | pedido | ventana anterior | posición al llegar | demanda del horizonte), y debajo las decisiones que explican la cifra: en qué modelos se concentra y por qué (los que llegan en cero), cuáles quedan en cero y por qué, los que dependen de un supuesto (sustitución, fin de generación) y los avisos. Luego una sección «Supuestos usados» con los de `supuestos_usados` que más pesan (lead time y tardías, cómo se estima la demanda en meses sin stock, sustitución en el hueco, corrección aprendida, fin de generación y stock de seguridad), cada uno con su valor y una frase de qué significa, marcando los que el planificador cambió frente al valor por defecto; si ninguno cambió, dilo. Si los supuestos en pantalla difieren de los valores por defecto, aclara que el pedido de referencia del análisis es el de los valores por defecto. Cierra con la venta no atendible en el hueco, ofrece ajustar cualquier supuesto o guardar el plan.
- Si preguntan qué supuestos usa el cálculo o qué significa un parámetro, responde con `supuestos_usados` de `contexto` en lenguaje de negocio, no con nombres de campos."""


def spec(ctx: ToolContext) -> AgentSpec:
    return AgentSpec(
        tools=build_tools(ctx), system_prompt=SYSTEM_PROMPT, approval_tools=APPROVAL_TOOLS, ctx=ctx
    )
