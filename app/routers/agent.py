"""Rutas del asistente: estado (proveedor, modelos), chat en streaming (SSE), reanudar tras una aprobación y
olvidar una conversación. El cuerpo dice sobre qué caso conversa (`case`): el planificador del Caso 1 o la cola
de renovaciones del Caso 2; cada uno tiene sus herramientas y su prompt."""

import json
from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.language_models import BaseChatModel

from app.config import Settings, get_settings
from app.routers import factory_order as factory_order_router
from app.routers import renewals as renewals_router
from app.schemas.agent import AgentStatus, ChatContext, ChatRequest, ModelChoice, Reasoning, ResumeRequest
from app.schemas.factory_order import Parameters
from app.schemas.renewals import Parameters as RenewalParameters
from app.services.agent import renewals_tools, runner, tools
from app.services.agent.common_tools import AgentSpec
from app.services.factory_order import plans
from app.services.renewals import calculation as renewals_calculation
from app.services.renewals.contact_log import ContactLogStore

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


def build_spec(body: ChatContext, settings: Settings) -> AgentSpec:
    """Las herramientas y el prompt del caso sobre el que se conversa. Cada fuente se carga aquí, dentro del
    endpoint, para que un Excel ausente de un caso no rompa el chat del otro."""
    if body.case == "renewals":
        dataset = renewals_router.current_dataset()
        store = ContactLogStore(settings.resolve(settings.contact_log_dir))
        day = body.day or renewals_calculation.derived(dataset).default_day
        ctx = renewals_tools.RenewalsToolContext(
            dataset=dataset,
            parameters=body.renewal_parameters or RenewalParameters(),
            day=day,
            agent=body.agent,
            contacts=store,
        )
        return renewals_tools.spec(ctx)
    dataset = factory_order_router.current_dataset()
    plan_store = plans.PlanStore(settings.resolve(settings.plans_dir))
    ctx = tools.ToolContext(
        dataset=dataset, parameters=body.parameters or Parameters(), plans=plan_store.list(), store=plan_store
    )
    return tools.spec(ctx)


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
def chat(body: ChatRequest, factory: Factory, settings: Annotated[Settings, Depends(get_settings)]):
    """Una vuelta de conversación. El cuerpo trae el historial (texto), el caso y lo que hay en pantalla. Si el
    agente se detiene en una acción que requiere aprobación, el stream termina con un evento `interrupt`."""
    spec = build_spec(body, settings)
    return _sse(runner.stream_chat(factory(body), spec, body.thread_id, body.messages))


@router.post("/resume", response_class=StreamingResponse, responses=_SSE_RESPONSES)
def resume(body: ResumeRequest, factory: Factory, settings: Annotated[Settings, Depends(get_settings)]):
    """Continúa tras una aprobación: una decisión por acción pendiente, en el mismo orden."""
    spec = build_spec(body, settings)
    return _sse(runner.resume_chat(factory(body), spec, body.thread_id, body.decisions))


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def forget(thread_id: str) -> None:
    """Olvida la conversación en el servidor (el frontend lo llama al salir del chat)."""
    runner.forget_thread(thread_id)
