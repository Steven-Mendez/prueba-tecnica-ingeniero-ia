"""El asistente del Caso 2: sus herramientas corren el motor de la cola y el chat emite los eventos esperados.
El modelo de lenguaje se sustituye por uno falso con respuestas guionadas (ver tests/fakes.py)."""

from datetime import date

import pytest
from langchain_core.messages import AIMessage, ToolCall

from app.schemas.renewals import Parameters
from app.services.agent.common_tools import ToolError
from app.services.agent.renewals_tools import RenewalsToolContext, build_tools
from app.services.renewals.contact_log import ContactLogStore
from tests.fakes import call, scripted_events

DAY = date(2026, 9, 15)


@pytest.fixture
def tools(renewals, tmp_path):
    ctx = RenewalsToolContext(
        dataset=renewals, parameters=Parameters(), day=DAY, contacts=ContactLogStore(tmp_path / "contactos")
    )
    return ctx, {t.name: t for t in build_tools(ctx)}


def test_context_and_queue(tools):
    _ctx, t = tools
    c = call(t, "contexto")
    assert c["dia"] == "2026-09-15" and c["pendientes_total"] == 116
    assert round(c["impacto"]["piso_usd_mes"]) == 28_615 and c["coincide_con_notebook"] is True
    assert not any(a["cambiado"] for a in c["supuestos_usados"])
    assert sum(a["pendientes"] for a in c["pendientes_por_gestor"]) == 116
    q = call(t, "cola_del_dia", gestor="G04", limite=5)
    assert q["mostradas"] == 5 and all(r["gestor"] == "G04" for r in q["filas"])
    assert q["filas"][0]["poliza"] == "CAP-DH-111156" and q["filas"][0]["dias_para_fecha_limite"] == 4


def test_simulate_does_not_touch_screen(tools):
    ctx, t = tools
    out = call(t, "simular", cambios={"daily_capacity": 200})
    assert out["impacto"]["en_ventana_simulado"] < 1 and out["impacto"]["polizas_sin_cupo"] == 151
    assert out["diferencia_frente_a_pantalla"]["en_ventana_simulado"] < 0
    assert ctx.actions == [] and ctx.parameters.daily_capacity == 250
    with pytest.raises(ToolError, match="Campos desconocidos"):
        t["simular"].invoke({"cambios": {"foo": 1}})
    with pytest.raises(ToolError, match="inválidos"):
        t["simular"].invoke({"cambios": {"deadline_days": 20, "open_days": 10}})


def test_apply_assumptions_and_day(tools):
    ctx, t = tools
    out = call(t, "aplicar_supuestos", cambios={"open_days": 12})
    assert out["aplicado"] == {"open_days": 12} and out["ahora"]["anticipacion_mediana_simulada_dias"] == 12
    assert ctx.actions[0]["action"] == "set_renewal_parameters"
    assert ctx.actions[0]["renewal_parameters"]["open_days"] == 12 and ctx.parameters.open_days == 12
    day = call(t, "cambiar_dia", fecha="2026-09-14")
    assert day["dia"] == "2026-09-14" and ctx.actions[1] == {"action": "set_day", "day": "2026-09-14"}
    with pytest.raises(ToolError, match="fin de semana"):
        t["cambiar_dia"].invoke({"fecha": "2026-09-12"})


def test_explain_message_and_summary(tools, client):
    _ctx, t = tools
    ex = call(t, "explicar_poliza", poliza="cap-dh-111156")
    assert ex["en_cola_hoy"] is True and ex["fila"]["score_usd"] > 0 and "fecha límite" in ex["como_se_llega"]
    with pytest.raises(ToolError, match="No existe"):
        t["explicar_poliza"].invoke({"poliza": "NOPE"})
    with pytest.raises(ToolError, match="canal automático"):
        t["redactar_mensaje"].invoke({"poliza": "CAP-DH-111156", "canal": "correo"})
    sheet = client.get(
        "/api/renewals/data/sheets/renewals",
        params={"q": "Domiciliado", "date_from": "2026-01-01", "page_size": 1},
    ).json()
    policy = sheet["rows"][0][[c["key"] for c in sheet["columns"]].index("Póliza")]
    msg = call(t, "redactar_mensaje", poliza=policy, canal="whatsapp")
    assert "vence el" in msg["mensaje"] and msg["poliza"] == policy
    summary = call(t, "resumen_interaccion", poliza="CAP-AU-106065")
    assert summary["intentos_bitacora"] and summary["siguiente_paso"]
    assert [a["fecha"] for a in summary["intentos_bitacora"]] == sorted(
        a["fecha"] for a in summary["intentos_bitacora"]
    )


def test_sheets_show_export_and_chart(tools):
    ctx, t = tools
    rows = call(t, "consultar_hoja", hoja="calls", gestor="G03", limite=5)
    assert rows["total_filas_que_cumplen"] > 5 and len(rows["filas"]) == 5
    assert call(t, "mostrar", seccion="cola") == {"abierto": "caso2/cola"}
    assert call(t, "mostrar", seccion="datos", pestana="calls") == {"abierto": "caso2/datos/calls"}
    with pytest.raises(ToolError):
        t["mostrar"].invoke({"seccion": "datos", "pestana": "nope"})
    assert call(t, "exportar_cola", solo_pendientes=True)["solo_pendientes"] is True
    chart = call(
        t,
        "grafico",
        titulo="Tramos",
        tipo="bar",
        eje_x="tramo",
        series=[{"key": "real", "label": "Real"}],
        datos=[{"tramo": "0-3", "real": 57}, {"tramo": "8-14", "real": 12}],
    )
    assert chart["filas"] == 2 and ctx.charts[0]["title"] == "Tramos"
    assert [a["action"] for a in ctx.actions] == ["navigate", "navigate", "download_queue_csv"]


def test_register_result_tool(tools):
    ctx, t = tools
    out = call(t, "registrar_resultado", poliza="CAP-DH-111156", resultado="Cotización enviada")
    assert out["registrado"] and out["gestor"] == "G04" and out["en_ventana_8_14"] is True
    assert ctx.actions[-1]["action"] == "contact_logged" and ctx.actions[-1]["policy"] == "CAP-DH-111156"
    assert (
        call(t, "cola_del_dia", gestor="G04", limite=50)["pendientes_total"]
        == call(t, "cola_del_dia", gestor="G04")["pendientes_total"]
    )
    assert ctx.queue().total_logged == 1
    with pytest.raises(ToolError, match="No existe"):
        t["registrar_resultado"].invoke({"poliza": "CAP-XX-1", "resultado": "Cierre"})


def test_chat_with_case_renewals_streams(client):
    scripted = [
        AIMessage(
            content="",
            tool_calls=[
                ToolCall(name="cola_del_dia", args={"gestor": "G04", "limite": 3}, id="c1"),
                ToolCall(name="mostrar", args={"seccion": "cola"}, id="c2"),
            ],
        ),
        AIMessage(content="Primero CAP-DH-111156: vence en 12 días y está a 4 de su fecha límite."),
    ]
    events = scripted_events(
        client,
        scripted,
        "chat",
        {
            "thread_id": "t-renewals",
            "case": "renewals",
            "day": "2026-09-15",
            "agent": "G04",
            "messages": [{"role": "user", "content": "¿A quién llamo primero?"}],
        },
    )
    kinds = [e["type"] for e in events]
    assert kinds[-1] == "done" and "error" not in kinds
    assert [e["name"] for e in events if e["type"] == "tool_call"] == ["cola_del_dia", "mostrar"]
    assert all(e["ok"] for e in events if e["type"] == "tool_result")
    actions = {e["action"]: e for e in events if e["type"] == "action"}
    assert actions["navigate"]["path"] == "caso2/cola"
    assert "".join(e["delta"] for e in events if e["type"] == "text").startswith("Primero")


def test_logging_a_result_requires_approval(client):
    thread = {"thread_id": "t-renewals-approve", "case": "renewals", "day": "2026-09-15"}
    events = scripted_events(
        client,
        [
            AIMessage(
                content="",
                tool_calls=[
                    ToolCall(
                        name="registrar_resultado",
                        args={"poliza": "CAP-AU-106065", "resultado": "Cierre", "gestor": "G02"},
                        id="c1",
                    )
                ],
            ),
            AIMessage(content="Registrado el cierre de CAP-AU-106065."),
        ],
        "chat",
        {**thread, "messages": [{"role": "user", "content": "Registra el cierre de CAP-AU-106065"}]},
    )
    assert events[-1]["type"] == "done"
    interrupt = next(e for e in events if e["type"] == "interrupt")
    assert interrupt["requests"][0]["name"] == "registrar_resultado"
    assert client.get("/api/renewals/contacts", params={"policy": "CAP-AU-106065"}).json() == []

    events = scripted_events(
        client,
        [AIMessage(content="Registrado el cierre de CAP-AU-106065.")],
        "resume",
        {**thread, "decisions": [{"type": "approve"}]},
    )
    assert any(e["type"] == "tool_result" and e["ok"] for e in events)
    logged = next(e for e in events if e["type"] == "action" and e["action"] == "contact_logged")
    assert logged["policy"] == "CAP-AU-106065" and logged["agent"] == "G02"
    contacts = client.get("/api/renewals/contacts", params={"policy": "CAP-AU-106065"}).json()
    assert len(contacts) == 1 and contacts[0]["result"] == "Cierre"
    client.delete(f"/api/renewals/contacts/{contacts[0]['id']}")


def test_rejected_registration_does_not_run(client):
    thread = {"thread_id": "t-renewals-reject", "case": "renewals", "day": "2026-09-15"}
    scripted_events(
        client,
        [
            AIMessage(
                content="",
                tool_calls=[
                    ToolCall(
                        name="registrar_resultado",
                        args={"poliza": "CAP-AU-108022", "resultado": "Cierre"},
                        id="c1",
                    )
                ],
            )
        ],
        "chat",
        {**thread, "messages": [{"role": "user", "content": "Registra el cierre"}]},
    )
    events = scripted_events(
        client,
        [AIMessage(content="Entendido, no lo registro.")],
        "resume",
        {**thread, "decisions": [{"type": "reject"}]},
    )
    assert not any(e["type"] == "action" for e in events)
    assert client.get("/api/renewals/contacts", params={"policy": "CAP-AU-108022"}).json() == []


def test_caso1_chat_without_case_still_works(client):
    events = scripted_events(
        client,
        [
            AIMessage(content="", tool_calls=[ToolCall(name="mostrar", args={"seccion": "ventas"}, id="c1")]),
            AIMessage(content="Abrí ventas."),
        ],
        "chat",
        {"thread_id": "t-caso1-default", "messages": [{"role": "user", "content": "Abre ventas"}]},
    )
    assert next(e for e in events if e["type"] == "action")["path"] == "ventas"
