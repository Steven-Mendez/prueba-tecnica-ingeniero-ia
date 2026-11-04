"""Rutas del asistente: estado (proveedor, modelos), chat en streaming (SSE), reanudar tras una aprobación y
olvidar una conversación."""

import json
from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.language_models import BaseChatModel

from app.config import Settings, get_settings
from app.routers.factory_order import Dataset, Plans
from app.schemas.agent import AgentStatus, ChatRequest, ModelChoice, Reasoning, ResumeRequest
from app.schemas.factory_order import Parameters
from app.services.agent import runner
from app.services.agent.tools import ToolContext

router = APIRouter(prefix="/agent", tags=["agent"])

ModelFactory = Callable[[ModelChoice], BaseChatModel]


def model_factory(settings: Annotated[Settings, Depends(get_settings)]) -> ModelFactory:
    """Construye el modelo del agente (OpenAI o Anthropic según la clave) con el modelo y el esfuerzo de
    razonamiento elegidos en el chat. Los tests lo sustituyen por un modelo falso con `app.dependency_overrides`."""
    backend = settings.agent_backend()
    if backend is None:
        raise HTTPException(
            503, "El asistente no está configurado: falta OPENAI_API_KEY o ANTHROPIC_API_KEY."
        )
    provider, default_model, key = backend
    options = settings.agent_model_options(provider)

    def build(choice: ModelChoice) -> BaseChatModel:
        model = choice.model or default_model
        if model not in options:
            raise HTTPException(422, f"Modelo no disponible: {model}. Opciones: {', '.join(options)}.")
        reasoning: Reasoning = choice.reasoning or "medium"
        if provider == "openai":
            from langchain_openai import ChatOpenAI

            # Con esfuerzo de razonamiento, las herramientas solo van por la Responses API
            return ChatOpenAI(
                model=model,
                api_key=key,
                max_completion_tokens=8000,
                reasoning_effort=reasoning,
                use_responses_api=True,
            )
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=model, api_key=key, max_tokens=8000, output_config={"effort": reasoning})

    return build


Factory = Annotated[ModelFactory, Depends(model_factory)]


def _sse(events: AsyncIterator[dict]) -> StreamingResponse:
    async def body():
        async for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
def agent_status(settings: Annotated[Settings, Depends(get_settings)]) -> AgentStatus:
    backend = settings.agent_backend()
    if backend is None:
        return AgentStatus(enabled=False, provider=None, model=None)
    provider, model, _key = backend
    return AgentStatus(
        enabled=True, provider=provider, model=model, models=settings.agent_model_options(provider)
    )


_SSE_RESPONSES = {
    200: {"content": {"text/event-stream": {}}, "description": "Eventos del chat (ver schemas/agent.py)"}
}


@router.post("/chat", response_class=StreamingResponse, responses=_SSE_RESPONSES)
def chat(body: ChatRequest, factory: Factory, dataset: Dataset, store: Plans):
    """Una vuelta de conversación. El cuerpo trae el historial (texto) y los supuestos en pantalla. Si el agente
    se detiene en una acción que requiere aprobación, el stream termina con un evento `interrupt`."""
    ctx = ToolContext(
        dataset=dataset, parameters=body.parameters or Parameters(), plans=store.list(), store=store
    )
    return _sse(runner.stream_chat(factory(body), ctx, body.thread_id, body.messages))


@router.post("/resume", response_class=StreamingResponse, responses=_SSE_RESPONSES)
def resume(body: ResumeRequest, factory: Factory, dataset: Dataset, store: Plans):
    """Continúa tras una aprobación: una decisión por acción pendiente, en el mismo orden."""
    ctx = ToolContext(
        dataset=dataset, parameters=body.parameters or Parameters(), plans=store.list(), store=store
    )
    return _sse(runner.resume_chat(factory(body), ctx, body.thread_id, body.decisions))


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def forget(thread_id: str) -> None:
    """Olvida la conversación en el servidor (el frontend lo llama al salir del chat)."""
    runner.forget_thread(thread_id)
