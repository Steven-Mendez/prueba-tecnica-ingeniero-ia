"""Herramientas del asistente de la cola de renovaciones (Caso 2).

El agente no calcula nada: cada herramienta llama al mismo motor determinista que usa la pantalla
(`calculation`, `explorer`, `explanation`) y devuelve un JSON compacto que el modelo resume. Algunas dejan
una acción para el frontend (cambiar los supuestos o el día, abrir una sección, recargar la cola tras un
registro, descargar el CSV); `registrar_resultado` se detiene y pide aprobación antes de ejecutarse.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

from langchain.tools import tool
from pydantic import ValidationError

from app.schemas import renewals as s
from app.services.agent.common_tools import (
    MAX_ROWS,
    AgentSpec,
    ToolError,
    _dump,
    _r,
    chart_tool,
    sheet_rows,
)
from app.services.renewals import calculation, explanation, explorer
from app.services.renewals.base import DataError
from app.services.renewals.contact_log import ContactLogStore
from app.services.renewals.source import LoadedRenewals

SECTIONS = ("cola", "panel", "supuestos", "datos", "inicio", "asistente")
APPROVAL_TOOLS = ("registrar_resultado",)
ASSUMPTION_FIELDS = set(s.Parameters.model_fields)

SYSTEM_PROMPT = """Eres el asistente de la cola de renovaciones de Capesa, la correduría de seguros de Casa Pellas (prototipo de una prueba técnica; todos los datos son ficticios). Ayudas al jefe de renovaciones y a los gestores a saber a quién llamar primero, por qué una póliza va donde va, qué pasa si cambian los supuestos y qué dicen los datos; la decisión es suya.

Reglas:
- Todas las cifras salen de las herramientas. Nunca inventes ni estimes de memoria: si no tienes el dato, llama a la herramienta. Si no sabes qué está viendo el usuario, empieza por `contexto`.
- La cola la arma un motor determinista con tres reglas: enrutar por canal (domiciliadas, financiadas y flotas corporativas al canal automático; teléfonos inválidos a corrección de datos; el resto a la cola telefónica), abrir cada expediente unos días antes del vencimiento (por defecto 14) y ordenar por días para la fecha límite (8 días antes) y, a igual fecha, por comisión potencial × mejora esperada del segmento. Tú no calculas: operas la herramienta y explicas.
- `aplicar_supuestos` y `cambiar_dia` cambian lo que el usuario ve; úsalas solo cuando pida explícitamente cambiar, fijar o activar algo. Para explorar o comparar escenarios usa `simular`.
- `registrar_resultado` anota el resultado de una llamada en la bitácora de la app y saca la póliza de la cola pendiente: se detiene y pide aprobación antes de ejecutarse. Antes, resume en una frase qué póliza, qué resultado y qué gestor. Si rechaza, no insistas.
- `redactar_mensaje` solo sirve para pólizas del canal automático (domiciliadas, financiadas, flotas); para las de la cola telefónica usa `resumen_interaccion` antes de una llamada de seguimiento.
- No hay telefonía ni envío de mensajes reales: el prototipo arma la cola, redacta borradores y registra resultados.
- Cuando el usuario pida ver o comparar, usa `grafico` con datos que ya obtuviste, o `mostrar` para abrir la pantalla que ya lo muestra.
- Responde en español, breve y concreto: cifras con unidad (pólizas, USD, días, %), listas cortas, negritas con moderación. Para datos por gestor, segmento o tramo usa una tabla Markdown. Di en una frase qué cambiaste en pantalla o qué abriste.
- Cuando una cifra dependa de un supuesto, dilo (por ejemplo, el techo de la simulación supone que la relación anticipación → renovación es causal).
- Si preguntan a quién llamar primero (o por la cola del día), llama a `contexto` y a `cola_del_dia` y responde como una instrucción de trabajo: cuántas pólizas pendientes hay (por gestor si no hay filtro), una tabla Markdown con las primeras (póliza | cliente y teléfono | vence | días para la fecha límite | prima y cambio | comisión | score) y una frase sobre el orden: primero las que están por salir de la ventana 8-14, a igual fecha las de mayor score. Ofrece explicar una póliza o registrar el resultado cuando terminen la llamada.
- Si preguntan por el impacto o por qué cambiar las reglas, usa `simular` (sin cambios da el escenario en pantalla) y responde con el rango: piso (volver a la tasa con 7 gestores), meta del piloto y techo (simulación), aclarando que es una expectativa a validar con el piloto A/B.
- Si preguntan cómo optimizar el proceso de renovaciones (la pregunta del caso: 5 gestores, 50 llamadas al día, estándar de 20 días, primer contacto a 3 días o menos en la mitad de los casos), llama a `contexto` y a `simular` (sin cambios) y responde como una respuesta al Comité, en cuatro bloques con títulos: **Diagnóstico** (desde diciembre de 2025 el primer contacto pasó de 16 a 3 días de anticipación y la renovación cayó de 62 % a 51 %; dos causas: 16 % menos caudal al pasar de 7 a 5 gestores y un cambio en la regla de apertura de la cola; el déficit de capacidad es pequeño, ~6 %; la ventana que renueva es 8-14 días (75 % frente a 41 % a 3 días o menos); una cuarta parte de la cartera, domiciliadas, financiadas y flotas, renueva igual sin llamada; nadie prioriza por valor; G03 demuestra que se puede con 5 gestores), **Propuesta: tres reglas sin contratar** (enrutar por canal antes de llamar, abrir cada expediente 14 días antes en vez de 3, ordenar la cola por fecha límite y por comisión × mejora esperada), **Impacto esperado** (una tabla Markdown piso | meta del piloto | techo con los USD al mes de `simular`, el % de primeros contactos en ventana hoy y simulado, las llamadas liberadas al mes, y la aclaración de que el techo supone que la relación anticipación → renovación es causal) y **Puesta en marcha** (corregir los teléfonos inválidos y confirmar canales de contacto; canal automático a domiciliadas, financiadas y flotas; piloto A/B por póliza dentro de cada gestor durante ~2 meses con ~1,475 pólizas por brazo, probando apertura a 12 frente a 14 días; decisión al mes 4). Cierra ofreciendo abrir la cola del día o simular otros supuestos."""


def _impact(sim: s.SimulationResult) -> dict[str, Any]:
    i, st = sim.impact, sim.stats
    return {
        "meses": i.months,
        "piso_usd_mes": _r(i.floor_month, 0),
        "meta_piloto_usd_mes": _r(i.target_month, 0),
        "techo_bajo_usd_mes": _r(i.ceiling_low_month, 0),
        "techo_alto_usd_mes": _r(i.ceiling_high_month, 0),
        "referencia_usd_mes": [_r(i.reference_low_month, 0), _r(i.reference_high_month, 0)],
        "tasa_cola_hoy": _r(i.collected_rate, 3),
        "tasa_cola_7_gestores": _r(i.rate_7g, 3),
        "tasa_esperada_simulacion": _r(i.expected_sim_rate, 3),
        "en_ventana_hoy": _r(st.share_window_real, 3),
        "en_ventana_simulado": _r(st.share_window_sim, 3),
        "a_3_dias_o_menos_hoy": _r(st.share_le3_real, 3),
        "despues_del_vencimiento_hoy": _r(st.share_after_real, 3),
        "anticipacion_mediana_hoy_dias": _r(st.median_real, 0),
        "anticipacion_mediana_simulada_dias": _r(st.median_sim, 0),
        "uso_medio_capacidad": _r(st.capacity_use_mean, 3),
        "dias_al_tope": _r(st.days_at_capacity_share, 3),
        "polizas_sin_cupo": st.unassigned,
        "ajuste_canal_automatico_usd_mes": _r(i.automatic_adjustment_month, 0),
    }


def _assumptions(p: s.Parameters, base: s.Parameters) -> list[dict[str, Any]]:
    labels = {
        "open_days": ("Apertura del expediente", "días antes del vencimiento en que entra a la cola"),
        "deadline_days": (
            "Fecha límite del primer contacto",
            "días antes del vencimiento (fin de la ventana 8-14)",
        ),
        "daily_capacity": ("Capacidad del equipo", "llamadas por día hábil"),
        "agents": ("Gestores", "reparten la cola y fijan la capacidad por gestor"),
        "grace_days": ("Gracia tras el vencimiento", "días en que se sigue intentando el primer contacto"),
        "target_window_share": ("Meta del piloto en ventana", "fracción de primeros contactos en 8-14"),
        "automatic_channel_rate": ("Renovación del canal automático", "None = la observada con llamada"),
    }
    return [
        {
            "campo": f,
            "supuesto": labels[f][0],
            "valor": getattr(p, f),
            "por_defecto": getattr(base, f),
            "cambiado": getattr(p, f) != getattr(base, f),
            "que_significa": labels[f][1],
        }
        for f in labels
    ]


def _row(r: s.QueueRow) -> dict[str, Any]:
    return {
        "poliza": r.policy,
        "cliente": r.client_id,
        "telefono": r.phone,
        "ramo": r.line,
        "segmento": r.segment,
        "aseguradora": r.insurer,
        "forma_de_pago": r.payment,
        "vence": r.expiry.isoformat(),
        "dias_al_vencimiento": r.days_to_expiry,
        "dias_para_fecha_limite": r.days_to_deadline,
        "prima_anterior_usd": _r(r.previous_premium, 0),
        "prima_renovacion_usd": _r(r.renewal_premium, 0),
        "cambio_prima": _r(r.premium_change, 3),
        "comision_potencial_usd": _r(r.potential_commission, 0),
        "mejora_esperada": _r(r.improvement, 3),
        "score_usd": _r(r.score, 0),
        "gestor": r.agent,
        "llamadas_en_bitacora": r.calls_logged,
        "estado": r.status,
        "ultimo_resultado": r.last_result,
    }


@dataclass
class RenewalsToolContext:
    """Estado de una conversación: la fuente, lo que hay en pantalla (supuestos, día, gestor) y lo que el agente
    dejó para la UI."""

    dataset: LoadedRenewals
    parameters: s.Parameters
    day: date
    agent: str | None = None
    contacts: ContactLogStore | None = None
    actions: list[dict[str, Any]] = field(default_factory=list)
    charts: list[dict[str, Any]] = field(default_factory=list)
    _results: dict[str, s.SimulationResult] = field(default_factory=dict)

    def simulation(self, p: s.Parameters | None = None) -> s.SimulationResult:
        p = p or self.parameters
        key = p.model_dump_json()
        if key not in self._results:
            self._results[key] = calculation.simulate(self.dataset, p)
        return self._results[key]

    def merged(self, changes: dict[str, Any] | None) -> s.Parameters:
        if not changes:
            return self.parameters
        unknown = sorted(set(changes) - ASSUMPTION_FIELDS)
        if unknown:
            raise ToolError(
                f"Campos desconocidos: {', '.join(unknown)}. Válidos: {', '.join(sorted(ASSUMPTION_FIELDS))}."
            )
        data = {**self.parameters.model_dump(mode="json"), **changes}
        try:
            return s.Parameters.model_validate(data)
        except ValidationError as exc:
            err = exc.errors()[0]
            raise ToolError(f"Supuestos inválidos: {err['msg']} ({'.'.join(map(str, err['loc']))})") from None

    def queue(self, agent: str | None = None) -> s.DailyQueue:
        try:
            return calculation.queue_for_day(self.dataset, self.parameters, self.day, agent, self.contacts)
        except DataError as exc:
            raise ToolError(exc.detail) from None


def build_tools(ctx: RenewalsToolContext) -> list:
    base = s.Parameters()

    @tool
    def contexto() -> str:
        """Qué hay en pantalla: el día de la cola, los supuestos (y cuáles difieren de los valores por defecto),
        el equipo, cuántas pólizas pendientes de primer contacto hay por gestor, los registros de hoy y el rango
        de impacto del escenario en pantalla. Empieza por aquí si no sabes qué está viendo el usuario."""
        sim = ctx.simulation()
        q = ctx.queue()
        d = sim.derived
        return _dump(
            {
                "dia": ctx.day.isoformat(),
                "gestor_filtrado": ctx.agent,
                "periodo_5_gestores": {
                    "desde": d.staffing_change_date,
                    "hasta": d.period_end,
                    "meses": d.months_in_period,
                },
                "equipo": [{"codigo": m.code, "nombre": m.name, "activo": m.active} for m in d.team],
                "supuestos_usados": _assumptions(ctx.parameters, base),
                "pendientes_total": q.total_pending,
                "pendientes_por_gestor": [
                    {
                        "gestor": a.agent,
                        "nombre": a.name,
                        "pendientes": a.pending,
                        "registradas": a.logged,
                        "comision_en_cola_usd": _r(a.commission, 0),
                    }
                    for a in q.by_agent
                ],
                "capacidad_por_gestor": q.capacity_per_agent,
                "registrados_hoy": {
                    "total": q.logged.count,
                    "efectivos": q.logged.effective,
                    "en_ventana": _r(q.logged.in_window_share, 3),
                },
                "canales_periodo": [
                    {
                        "canal": c.channel,
                        "polizas": c.policies,
                        "pct_polizas": _r(c.share_policies, 3),
                        "pct_comision": _r(c.share_commission, 3),
                        "tasa": _r(c.renewal_rate, 3),
                    }
                    for c in sim.channels.period
                ],
                "llamadas_liberadas_al_mes": _r(sim.channels.freed_calls_per_month, 0),
                "impacto": _impact(sim),
                "coincide_con_notebook": sim.notebook_check.matches if sim.notebook_check else None,
                "avisos": sim.warnings + q.warnings,
            }
        )

    @tool
    def cola_del_dia(gestor: str | None = None, limite: int = 20, solo_pendientes: bool = True) -> str:
        """La cola del día en pantalla: pólizas pendientes de primer contacto ordenadas por días para la fecha
        límite y, a igual fecha, por score (comisión × mejora esperada). `gestor` (G01…G05) filtra; sin él se usa
        el filtro de la pantalla. Máximo 50 filas por llamada."""
        q = ctx.queue(gestor or ctx.agent)
        rows = [r for r in q.rows if r.status == "pending"] if solo_pendientes else q.rows
        n = max(1, min(limite, MAX_ROWS))
        return _dump(
            {
                "dia": q.day.isoformat(),
                "gestor": q.agent,
                "pendientes_total": q.total_pending,
                "registradas_total": q.total_logged,
                "mostradas": min(n, len(rows)),
                "filas": [_row(r) for r in rows[:n]],
                "orden": "días para la fecha límite ascendente, luego score descendente",
            }
        )

    @tool
    def simular(cambios: dict[str, Any] | None = None) -> str:
        """Corre la simulación con los supuestos en pantalla más `cambios` (open_days, deadline_days,
        daily_capacity, agents, grace_days, target_window_share, automatic_channel_rate) sin tocar la pantalla.
        Devuelve anticipación, uso de capacidad, impacto (piso, meta, techo), sensibilidad a la capacidad y la
        diferencia frente al escenario en pantalla."""
        p = ctx.merged(cambios)
        sim = ctx.simulation(p)
        out: dict[str, Any] = {
            "supuestos_usados": _assumptions(p, base),
            "impacto": _impact(sim),
            "sensibilidad_capacidad": [
                {
                    "llamadas_dia": r.capacity,
                    "en_ventana": _r(r.share_window, 3),
                    "a_3_dias_o_menos": _r(r.share_le3, 3),
                    "sin_cupo": r.unassigned,
                }
                for r in sim.capacity_sensitivity
            ],
            "piloto": {"polizas_por_brazo": sim.pilot.n_per_arm, "meses": _r(sim.pilot.months, 1)},
            "avisos": sim.warnings,
        }
        if cambios:
            here, there = _impact(ctx.simulation()), _impact(sim)
            out["diferencia_frente_a_pantalla"] = {
                k: _r(there[k] - here[k], 0 if "usd" in k else 3)
                for k in (
                    "piso_usd_mes",
                    "meta_piloto_usd_mes",
                    "techo_alto_usd_mes",
                    "en_ventana_simulado",
                    "uso_medio_capacidad",
                )
            }
        return _dump(out)

    @tool
    def aplicar_supuestos(cambios: dict[str, Any]) -> str:
        """Cambia los supuestos en pantalla (la simulación y la cola se recalculan para el usuario). Úsala solo
        cuando pida explícitamente cambiar algo; para explorar usa `simular`."""
        before = _impact(ctx.simulation())
        ctx.parameters = ctx.merged(cambios)
        after = _impact(ctx.simulation())
        ctx.actions.append(
            {"action": "set_renewal_parameters", "renewal_parameters": ctx.parameters.model_dump(mode="json")}
        )
        return _dump({"aplicado": cambios, "antes": before, "ahora": after})

    @tool
    def cambiar_dia(fecha: date) -> str:
        """Cambia el día de la cola en pantalla (día hábil entre dic-2025 y sep-2026)."""
        try:
            ts = calculation.validate_day(ctx.dataset, fecha)
        except DataError as exc:
            raise ToolError(exc.detail) from None
        ctx.day = ts.date()
        ctx.actions.append({"action": "set_day", "day": ctx.day.isoformat()})
        q = ctx.queue()
        return _dump({"dia": ctx.day.isoformat(), "pendientes_total": q.total_pending})

    def _detail(poliza: str) -> s.PolicyDetail:
        try:
            return calculation.policy_detail(ctx.dataset, ctx.parameters, poliza, ctx.day, ctx.contacts)
        except DataError as exc:
            raise ToolError(exc.detail) from None

    @tool
    def explicar_poliza(poliza: str) -> str:
        """Cómo se llega a la prioridad de una póliza: canal, apertura, fecha límite, comisión, mejora esperada
        del segmento y score, además de sus llamadas históricas y si está en la cola de hoy."""
        d = _detail(poliza)
        return _dump(
            {
                "poliza": d.policy,
                "canal": d.channel,
                "en_cola_hoy": d.in_queue_today,
                "fila": _row(d.row) if d.row else None,
                "renovo_en_los_datos": d.renewed,
                "llamadas_historicas": len(d.calls),
                "registros_en_la_app": len(d.contacts),
                "como_se_llega": d.explanation,
            }
        )

    @tool
    def redactar_mensaje(poliza: str, canal: Literal["whatsapp", "correo"] = "whatsapp") -> str:
        """Borrador del mensaje de renovación del canal automático para una póliza domiciliada, financiada o
        de flota corporativa (S2.14). Para pólizas de la cola telefónica no aplica."""
        d = _detail(poliza)
        text = d.message_whatsapp if canal == "whatsapp" else d.message_email
        if text is None:
            raise ToolError(
                f"La póliza {d.policy} va a «{d.channel}»: el mensaje automático es solo para el canal automático."
            )
        return _dump({"poliza": d.policy, "canal": canal, "mensaje": text})

    @tool
    def resumen_interaccion(poliza: str) -> str:
        """Resumen de la última interacción antes de una llamada de seguimiento: los intentos de la bitácora,
        los resultados registrados en la app y el siguiente paso sugerido."""
        key = poliza.strip().upper()
        ren = ctx.dataset.base.renewals
        match = ren[ren["Póliza"] == key]
        if match.empty:
            raise ToolError(f"No existe la póliza «{poliza}».")
        calls = ctx.dataset.base.calls[ctx.dataset.base.calls["Póliza"] == key]
        contacts = ctx.contacts.list(policy=key) if ctx.contacts else []
        return _dump(explanation.interaction_summary(match.iloc[0], calls, contacts))

    @tool
    def registrar_resultado(
        poliza: str,
        resultado: Literal[
            "Contactado",
            "Pide llamar después",
            "Cotización enviada",
            "Cierre",
            "No contesta",
            "Número equivocado",
        ],
        nota: str = "",
        gestor: str | None = None,
    ) -> str:
        """Registra el resultado de la llamada a una póliza de la cola del día (la póliza sale de la cola
        pendiente). Requiere la aprobación de la persona. `gestor` por defecto es el filtrado en pantalla o el
        asignado a la póliza."""
        if ctx.contacts is None:
            raise ToolError("El registro de resultados no está disponible en este contexto.")
        key = poliza.strip().upper()
        agent = gestor or ctx.agent
        if agent is None:
            d = _detail(key)
            agent = d.row.agent if d.row else None
            if agent is None:
                ren = ctx.dataset.base.renewals
                match = ren[ren["Póliza"] == key]
                agent = str(match.iloc[0]["Gestor"]) if not match.empty else None
        if agent is None:
            raise ToolError(f"No existe la póliza «{poliza}».")
        body = s.ContactCreate(policy=key, agent=agent, result=resultado, note=nota, day=ctx.day)
        try:
            record = calculation.log_contact(ctx.dataset, ctx.parameters, body, ctx.contacts)
        except DataError as exc:
            raise ToolError(exc.detail) from None
        ctx.actions.append(
            {
                "action": "contact_logged",
                "contact_id": record.id,
                "policy": record.policy,
                "agent": record.agent,
            }
        )
        return _dump(
            {
                "registrado": True,
                "id": record.id,
                "poliza": record.policy,
                "gestor": record.agent,
                "resultado": record.result,
                "dia": record.day.isoformat(),
                "dias_al_vencimiento": record.days_to_expiry,
                "en_ventana_8_14": record.in_window,
                "contacto_efectivo": record.effective,
            }
        )

    @tool
    def consultar_hoja(
        hoja: Literal["renewals", "calls", "team"],
        buscar: str = "",
        gestor: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        ordenar_por: str | None = None,
        descendente: bool = False,
        limite: int = 20,
    ) -> str:
        """Filas de una hoja de datos ya limpia (renewals = una fila por póliza con anticipación, tramo, canal
        y comisión; calls = bitácora de llamadas con resultado e intento; team = gestores). `buscar` busca texto
        en cualquier columna; `gestor` filtra por código; `ordenar_por` es la clave de una columna. Máximo 50 filas."""
        try:
            page = explorer.sheet_page(
                ctx.dataset,
                hoja,
                page=1,
                page_size=max(1, min(limite, MAX_ROWS)),
                q=buscar,
                model=gestor,
                date_from=date_from,
                date_to=date_to,
                sort=ordenar_por,
                desc=descendente,
            )
        except DataError as exc:
            raise ToolError(exc.detail) from None
        return _dump(sheet_rows(page))

    @tool
    def exportar_cola(solo_pendientes: bool = False) -> str:
        """Descarga para el usuario el CSV de la cola del día en pantalla (el mismo que exporta el notebook)."""
        ctx.actions.append(
            {"action": "download_queue_csv", "day": ctx.day.isoformat(), "pending_only": solo_pendientes}
        )
        return _dump(
            {
                "descarga_iniciada": f"cola_renovaciones_{ctx.day.isoformat()}.csv",
                "solo_pendientes": solo_pendientes,
            }
        )

    @tool
    def mostrar(
        seccion: Literal["cola", "panel", "supuestos", "datos", "inicio", "asistente"],
        pestana: str | None = None,
    ) -> str:
        """Abre una sección del prototipo para el usuario: cola (la cola del día), panel (panel del jefe),
        supuestos (simulación e impacto), datos (hojas: renewals, calls, team), inicio."""
        if seccion == "datos":
            if pestana and pestana not in explorer.SHEETS:
                raise ToolError(f"Hojas: {', '.join(explorer.SHEETS)}.")
            path = f"caso2/datos/{pestana}" if pestana else "caso2/datos"
        else:
            path = f"caso2/{seccion}"
        ctx.actions.append({"action": "navigate", "path": path})
        return _dump({"abierto": path})

    grafico = chart_tool(ctx)

    return [
        contexto,
        cola_del_dia,
        simular,
        aplicar_supuestos,
        cambiar_dia,
        explicar_poliza,
        redactar_mensaje,
        resumen_interaccion,
        registrar_resultado,
        consultar_hoja,
        exportar_cola,
        mostrar,
        grafico,
    ]


def spec(ctx: RenewalsToolContext) -> AgentSpec:
    return AgentSpec(
        tools=build_tools(ctx), system_prompt=SYSTEM_PROMPT, approval_tools=APPROVAL_TOOLS, ctx=ctx
    )
