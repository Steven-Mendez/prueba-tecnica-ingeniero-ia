"""El asistente: sus herramientas corren el motor del planificador y el chat emite los eventos esperados.

El modelo de lenguaje se sustituye por uno falso con respuestas guionadas: aquí se prueba el cableado
(herramientas, acciones para la UI, stream), no a Claude.
"""

import pytest
from langchain_core.messages import AIMessage, ToolCall

from app.main import app
from app.routers.agent import model_factory
from app.schemas.factory_order import Parameters
from app.services.agent.tools import ToolContext, ToolError, build_tools
from tests.fakes import API, ScriptedModel, call, read_events, scripted_events


@pytest.fixture
def tools(dataset):
    ctx = ToolContext(dataset=dataset, parameters=Parameters())
    return ctx, {t.name: t for t in build_tools(ctx)}


def test_context_and_order_match_notebook(tools):
    _ctx, t = tools
    ctx = call(t, "contexto")
    assert ctx["ventana"] == "oct-2026" and ctx["pedido_actual"]["total_unidades"] == 341
    assert ctx["catalogo"]["reglas_fabrica"]["Yaris"] == {"min_order": 16, "lot_multiple": 8}
    used = {a["supuesto"]: a for a in ctx["supuestos_usados"]}
    assert used["Lead time"]["valor"] == "104 días" and not used["Lead time"]["cambiado"]
    assert used["Fin de generación"]["valor"] == "RAV4 liquidación 10 %"
    assert not any(a["cambiado"] for a in ctx["supuestos_usados"])
    order = call(t, "calcular_pedido")
    assert order["total_unidades"] == 341 and order["coincide_con_notebook"] is True
    assert "diferencia_frente_a_pantalla" not in order


def test_calculate_scenario_does_not_touch_screen(tools):
    ctx, t = tools
    out = call(t, "calcular_pedido", cambios={"demand_multiplier": 1.2})
    assert out["total_unidades"] == 486 and out["diferencia_frente_a_pantalla"]["total_unidades"] == 145
    changed = [a for a in out["supuestos_usados"] if a["cambiado"]]
    assert [(a["supuesto"], a["valor"]) for a in changed] == [("Ajuste de demanda", "+20 %")]
    assert ctx.actions == [] and ctx.parameters.demand_multiplier == 1.0


def test_apply_assumptions_records_action(tools):
    ctx, t = tools
    out = call(t, "aplicar_supuestos", cambios={"overrides": {"Yaris": {"forced_order": 16}}})
    assert out["aplicado"] and out["ahora"]["total_unidades"] == 357
    assert ctx.actions[0]["action"] == "set_parameters"
    assert ctx.actions[0]["parameters"]["overrides"]["Yaris"]["forced_order"] == 16
    reset = call(t, "restablecer_supuestos")
    assert reset["ahora"]["total_unidades"] == 341 and ctx.parameters.overrides == {}


def test_invalid_changes_are_reported_to_the_model(tools):
    _ctx, t = tools
    with pytest.raises(ToolError, match="Campos desconocidos"):
        t["calcular_pedido"].invoke({"cambios": {"foo": 1}})
    with pytest.raises(ToolError, match="inválidos"):
        t["calcular_pedido"].invoke({"cambios": {"demand_multiplier": -1}})
    with pytest.raises(ToolError, match="desconocido"):
        t["explicar_modelo"].invoke({"modelo": "Supra"})


def test_explain_sensitivity_and_accuracy(tools):
    _ctx, t = tools
    yaris = call(t, "explicar_modelo", modelo="yaris")
    assert yaris["caso"] == "below_minimum" and "mínimo" in yaris["como_se_llega"]
    assert len(yaris["historia_mensual"]) == 18
    sens = call(t, "sensibilidad")
    assert (sens["total_min"], sens["total_max"]) == (204, 486) and sens["modelo_mas_sensible"] == "Hilux"
    acc = call(t, "precision")
    assert acc["ciclos_medidos"] == 6 and acc["pedido_con_correccion_aprendida"]["total_unidades"] == 322


def test_sales_and_sheets(tools):
    _ctx, t = tools
    v = call(t, "ventas", modelos=["Hilux"])
    assert v["kpis"]["units"] == 414 and v["por_modelo"][0]["clave"] == "Hilux"
    rows = call(t, "consultar_hoja", hoja="orders", modelo="Yaris", limite=5)
    assert rows["total_filas_que_cumplen"] > 5 and len(rows["filas"]) == 5
    with pytest.raises(ToolError):
        t["consultar_hoja"].invoke({"hoja": "orders", "ordenar_por": "no_existe"})


def test_show_and_chart(tools):
    ctx, t = tools
    assert call(t, "mostrar", seccion="planificador", pestana="sensibilidad") == {
        "abierto": "planificador/sensibilidad"
    }
    with pytest.raises(ToolError):
        t["mostrar"].invoke({"seccion": "planificador", "pestana": "otra"})
    chart = call(
        t,
        "grafico",
        titulo="Pedido",
        tipo="bar",
        eje_x="modelo",
        series=[{"key": "pedido", "label": "Pedido"}],
        datos=[{"modelo": "Hilux", "pedido": 42}, {"modelo": "Yaris", "pedido": 0}],
    )
    assert chart["filas"] == 2 and ctx.charts[0]["data"][0] == {"modelo": "Hilux", "pedido": 42}
    assert ctx.actions[0] == {"action": "navigate", "path": "planificador/sensibilidad"}


def test_status_and_chat_without_key(client):
    assert client.get(f"{API}/status").json()["enabled"] is False
    r = client.post(
        f"{API}/chat", json={"thread_id": "t-nokey", "messages": [{"role": "user", "content": "hola"}]}
    )
    assert r.status_code == 503


def test_chat_streams_tool_calls_actions_and_text(client):
    scripted = [
        AIMessage(
            content="",
            tool_calls=[
                ToolCall(name="aplicar_supuestos", args={"cambios": {"demand_multiplier": 1.2}}, id="c1"),
                ToolCall(name="mostrar", args={"seccion": "planificador", "pestana": "pedido"}, id="c2"),
            ],
        ),
        AIMessage(content="Listo: con demanda +20 % el pedido sube a 486 unidades."),
    ]
    app.dependency_overrides[model_factory] = lambda: lambda _choice: ScriptedModel(messages=iter(scripted))
    try:
        r = client.post(
            f"{API}/chat",
            json={
                "thread_id": "t-stream",
                "messages": [{"role": "user", "content": "Sube la demanda 20 % y muéstrame el pedido"}],
                "parameters": {},
            },
        )
    finally:
        app.dependency_overrides.pop(model_factory, None)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = read_events(r)
    kinds = [e["type"] for e in events]
    assert kinds[-1] == "done" and "error" not in kinds
    assert [e["name"] for e in events if e["type"] == "tool_call"] == ["aplicar_supuestos", "mostrar"]
    assert all(e["ok"] for e in events if e["type"] == "tool_result")
    # Las dos herramientas corren en paralelo: el orden de las acciones no está garantizado
    actions = {e["action"]: e for e in events if e["type"] == "action"}
    assert actions["set_parameters"]["parameters"]["demand_multiplier"] == 1.2
    assert (actions["navigate"]["action"], actions["navigate"]["path"]) == ("navigate", "planificador/pedido")
    assert "".join(e["delta"] for e in events if e["type"] == "text").startswith("Listo")


def test_chat_reports_tool_errors_to_the_model(client):
    scripted = [
        AIMessage(
            content="", tool_calls=[ToolCall(name="explicar_modelo", args={"modelo": "Supra"}, id="c1")]
        ),
        AIMessage(content="No existe ese modelo."),
    ]
    app.dependency_overrides[model_factory] = lambda: lambda _choice: ScriptedModel(messages=iter(scripted))
    try:
        r = client.post(
            f"{API}/chat",
            json={"thread_id": "t-error", "messages": [{"role": "user", "content": "explica Supra"}]},
        )
    finally:
        app.dependency_overrides.pop(model_factory, None)
    events = read_events(r)
    assert [e["ok"] for e in events if e["type"] == "tool_result"] == [False]
    assert events[-1]["type"] == "done" and "error" not in [e["type"] for e in events]


def test_backend_selection():
    from app.config import Settings

    assert Settings(openai_api_key=None, anthropic_api_key=None).agent_backend() is None
    assert Settings(openai_api_key="o", anthropic_api_key="a").agent_backend() == ("openai", "gpt-5.5", "o")
    assert Settings(
        openai_api_key="o", anthropic_api_key="a", agent_provider="anthropic"
    ).agent_backend() == (
        "anthropic",
        "claude-opus-5-5",
        "a",
    )
    assert (
        Settings(anthropic_api_key="a", agent_model="claude-sonnet-5-5").agent_backend()[1]
        == "claude-sonnet-5-5"
    )
    assert Settings(openai_api_key="o", agent_provider="anthropic").agent_backend() is None


def test_plan_tools_and_export(dataset, tmp_path):
    from app.services.factory_order.plans import PlanStore

    ctx = ToolContext(dataset=dataset, parameters=Parameters(), store=PlanStore(tmp_path / "planes"))
    t = {x.name: x for x in build_tools(ctx)}
    assert call(t, "listar_planes") == {"planes": []}
    saved = call(t, "guardar_plan", nombre="Pedido oct-2026", nota="valores por defecto")
    assert saved["guardado"] and saved["plan"]["total_unidades"] == 341 and saved["plan"]["estado"] == "draft"
    plan_id = saved["plan"]["id"]
    assert ctx.actions[-1] == {"action": "plans_changed", "plan_id": plan_id, "plan_name": "Pedido oct-2026"}
    assert call(t, "cambiar_estado_plan", plan_id=plan_id, estado="sent")["plan"]["estado"] == "sent"
    assert len(call(t, "listar_planes")["planes"]) == 1
    assert call(t, "exportar_csv", tabla="version") == {"descarga_iniciada": "version"}
    assert ctx.actions[-1] == {"action": "download_csv", "table": "version"}
    assert call(t, "borrar_plan", plan_id=plan_id)["borrado"] is True
    with pytest.raises(ToolError):
        t["borrar_plan"].invoke({"plan_id": plan_id})


def test_saving_a_plan_requires_approval(client):
    thread = {"thread_id": "t-approve", "parameters": {}}
    events = scripted_events(
        client,
        [
            AIMessage(
                content="",
                tool_calls=[ToolCall(name="guardar_plan", args={"nombre": "Plan aprobado"}, id="c1")],
            )
        ],
        "chat",
        {**thread, "messages": [{"role": "user", "content": "Guarda el plan"}]},
    )
    kinds = [e["type"] for e in events]
    assert "interrupt" in kinds and "tool_result" not in kinds and kinds[-1] == "done"
    pending = next(e for e in events if e["type"] == "interrupt")["requests"]
    assert pending[0]["name"] == "guardar_plan" and pending[0]["args"]["nombre"] == "Plan aprobado"
    assert client.get("/api/factory-order/plans").json() == []

    events = scripted_events(
        client,
        [AIMessage(content="Plan guardado.")],
        "resume",
        {**thread, "decisions": [{"type": "approve"}]},
    )
    assert [e["ok"] for e in events if e["type"] == "tool_result"] == [True]
    assert next(e for e in events if e["type"] == "action")["action"] == "plans_changed"
    plans = client.get("/api/factory-order/plans").json()
    assert [p["name"] for p in plans] == ["Plan aprobado"]
    client.delete(f"/api/factory-order/plans/{plans[0]['id']}")
    assert client.delete(f"{API}/threads/t-approve").status_code == 204


def test_rejected_action_does_not_run(client):
    thread = {"thread_id": "t-reject", "parameters": {}}
    scripted_events(
        client,
        [AIMessage(content="", tool_calls=[ToolCall(name="guardar_plan", args={"nombre": "No"}, id="c1")])],
        "chat",
        {**thread, "messages": [{"role": "user", "content": "Guarda el plan"}]},
    )
    events = scripted_events(
        client,
        [AIMessage(content="Entendido, no lo guardo.")],
        "resume",
        {**thread, "decisions": [{"type": "reject", "message": "No lo guardes."}]},
    )
    assert "action" not in [e["type"] for e in events] and client.get("/api/factory-order/plans").json() == []
    assert "".join(e["delta"] for e in events if e["type"] == "text").startswith("Entendido")


def test_unknown_model_choice_is_422(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        status = client.get(f"{API}/status").json()
        assert status["enabled"] and status["model"] == "gpt-5.5" and status["models"][0] == "gpt-5.5"
        r = client.post(
            f"{API}/chat",
            json={
                "thread_id": "t-model",
                "model": "gpt-99",
                "messages": [{"role": "user", "content": "hola"}],
            },
        )
        assert r.status_code == 422
    finally:
        get_settings.cache_clear()
