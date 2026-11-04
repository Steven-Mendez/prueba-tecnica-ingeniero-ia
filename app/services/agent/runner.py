"""El asistente: un agente LangChain (bucle de herramientas de LangGraph) sobre cada prototipo.

El modelo no calcula nada: llama a las herramientas del caso (`tools.py` para el planificador, `renewals_tools.py`
para la cola de renovaciones), que corren el mismo motor determinista que la pantalla, y resume en lenguaje de negocio. `stream_chat` traduce el stream de LangGraph a los eventos que
consume el frontend (texto, llamadas a herramientas, acciones sobre la UI, gráficos, aprobaciones pendientes).

Human in the loop: guardar, borrar o marcar como enviado un plan se detiene con un `interrupt` de LangGraph
antes de ejecutarse y continúa con la decisión de la persona (`Command(resume=...)`). Eso exige un checkpointer;
aquí es en memoria y por conversación (`thread_id`): se borra al salir del chat y no sobrevive a un reinicio.
Es una demo: no hace falta persistir el chat.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware, ToolErrorMiddleware
from langchain.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.language_models import BaseChatModel
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from app.schemas import agent as s
from app.services.agent.common_tools import AgentSpec, ToolError, UIContext

logger = logging.getLogger(__name__)

THREAD_TTL_SECONDS = 2 * 60 * 60

# Un checkpointer para todo el proceso: el estado de cada conversación vive bajo su thread_id
checkpointer = InMemorySaver()
_last_used: dict[str, float] = {}


def forget_thread(thread_id: str) -> None:
    _last_used.pop(thread_id, None)
    checkpointer.delete_thread(thread_id)


def _touch(thread_id: str) -> None:
    now = time.monotonic()
    _last_used[thread_id] = now
    for stale in [t for t, used in _last_used.items() if now - used > THREAD_TTL_SECONDS]:
        forget_thread(stale)


def _tool_error(exc: Exception, _request) -> str | None:
    """Un parámetro inválido o un modelo desconocido vuelven al modelo como texto para que lo corrija; cualquier
    otro error interno corta la vuelta (y llega al usuario como evento de error)."""
    if isinstance(exc, ToolError):
        return f"Error: {exc}"
    return None


async def _atool_error(exc: Exception, request) -> str | None:
    return _tool_error(exc, request)


def build_agent(model: BaseChatModel, spec: AgentSpec):
    """El agente de un caso: sus herramientas, su prompt y las que piden aprobación (ver `AgentSpec`)."""
    return create_agent(
        model,
        tools=spec.tools,
        system_prompt=spec.system_prompt,
        middleware=[
            ToolErrorMiddleware(on_error=_tool_error, aon_error=_atool_error),
            HumanInTheLoopMiddleware(
                interrupt_on=dict.fromkeys(spec.approval_tools, True),
                description_prefix="Esta acción requiere la aprobación de la persona",
            ),
        ],
        checkpointer=checkpointer,
    )


def _to_messages(history: list[s.ChatMessage]) -> list[dict[str, str]]:
    return [{"role": m.role, "content": m.content} for m in history]


def _interrupt_event(interrupts) -> dict[str, Any]:
    requests = []
    for interrupt in interrupts:
        value = getattr(interrupt, "value", interrupt)
        for req in (value or {}).get("action_requests", []):
            requests.append(
                s.ActionRequest(
                    name=req.get("name", ""),
                    args=req.get("args") or req.get("arguments") or {},
                    description=req.get("description", ""),
                )
            )
    return s.InterruptEvent(requests=requests).model_dump()


async def _stream(agent, payload, config, ctx: UIContext) -> AsyncIterator[dict[str, Any]]:
    try:
        async for chunk in agent.astream(payload, config, stream_mode=["messages", "updates"], version="v2"):
            if chunk["type"] == "messages":
                token, _meta = chunk["data"]
                if isinstance(token, AIMessageChunk) and token.text:
                    yield s.TextEvent(delta=token.text).model_dump()
            elif chunk["type"] == "updates":
                for source, update in chunk["data"].items():
                    if source == "__interrupt__":
                        yield _interrupt_event(update)
                        continue
                    for message in (update or {}).get("messages", []):
                        if source == "model" and isinstance(message, AIMessage):
                            for call in message.tool_calls:
                                yield s.ToolCallEvent(name=call["name"], args=call["args"]).model_dump()
                        elif source == "tools" and isinstance(message, ToolMessage):
                            yield s.ToolResultEvent(
                                name=message.name or "", ok=message.status != "error"
                            ).model_dump()
                    # Lo que las herramientas dejaron para la UI
                    while ctx.actions:
                        yield s.ActionEvent(**ctx.actions.pop(0)).model_dump(mode="json")
                    while ctx.charts:
                        yield s.ChartEvent(**ctx.charts.pop(0)).model_dump()
    except Exception as exc:  # noqa: BLE001 - el stream ya empezó: el error viaja como evento
        logger.exception("Error del asistente")
        yield s.ErrorEvent(message=f"{type(exc).__name__}: {exc}").model_dump()
    yield s.DoneEvent().model_dump()


async def stream_chat(
    model: BaseChatModel, spec: AgentSpec, thread_id: str, history: list[s.ChatMessage]
) -> AsyncIterator[dict[str, Any]]:
    """Una vuelta de conversación. Si el servidor ya tiene el hilo, basta el último mensaje; si no (primer
    mensaje o reinicio), se manda el historial completo que guarda el frontend."""
    _touch(thread_id)
    agent = build_agent(model, spec)
    config = {"configurable": {"thread_id": thread_id}}
    state = await agent.aget_state(config)
    known = bool((state.values or {}).get("messages"))
    messages = _to_messages(history[-1:] if known else history)
    async for event in _stream(agent, {"messages": messages}, config, spec.ctx):
        yield event


async def resume_chat(
    model: BaseChatModel, spec: AgentSpec, thread_id: str, decisions: list[s.Decision]
) -> AsyncIterator[dict[str, Any]]:
    """Continúa una conversación detenida en una aprobación con las decisiones de la persona."""
    _touch(thread_id)
    agent = build_agent(model, spec)
    config = {"configurable": {"thread_id": thread_id}}
    payload = Command(resume={"decisions": [d.model_dump(exclude_none=True) for d in decisions]})
    async for event in _stream(agent, payload, config, spec.ctx):
        yield event
