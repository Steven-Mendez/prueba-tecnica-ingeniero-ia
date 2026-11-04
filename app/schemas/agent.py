"""Esquemas del asistente (agente sobre el planificador). `frontend/src/features/agent/types.ts` los replica."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.factory_order import Parameters

Reasoning = Literal["low", "medium", "high"]


class AgentStatus(BaseModel):
    enabled: bool = Field(description="Hay clave de API configurada")
    provider: Literal["openai", "anthropic"] | None
    model: str | None = Field(description="Modelo por defecto")
    models: list[str] = Field(default_factory=list, description="Modelos que ofrece el selector")
    reasoning: Reasoning = "medium"


class ModelChoice(BaseModel):
    """Modelo y esfuerzo de razonamiento elegidos en el chat (vacío = los de defecto)."""

    model: str | None = Field(None, max_length=80)
    reasoning: Reasoning | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(ModelChoice):
    # Identifica la conversación en el servidor (checkpointer en memoria de LangGraph, necesario para las
    # aprobaciones). Lo genera el frontend y se borra al salir del chat.
    thread_id: str = Field(min_length=4, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    # Lo que el planificador tiene en pantalla; las herramientas parten de ahí. None = valores por defecto.
    parameters: Parameters | None = None


class Decision(BaseModel):
    """Respuesta de la persona a una acción que pidió aprobación (human in the loop)."""

    type: Literal["approve", "reject", "edit", "respond"]
    message: str | None = Field(None, max_length=2000)
    edited_action: dict[str, Any] | None = None


class ResumeRequest(ModelChoice):
    thread_id: str = Field(min_length=4, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    decisions: list[Decision] = Field(min_length=1, max_length=10)
    parameters: Parameters | None = None


# Eventos del stream (SSE, uno por línea `data:`). El frontend los replica en types.ts.
class TextEvent(BaseModel):
    type: Literal["text"] = "text"
    delta: str


class ToolCallEvent(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    name: str
    args: dict[str, Any]


class ToolResultEvent(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    name: str
    ok: bool


class ActionEvent(BaseModel):
    """Acción que el frontend ejecuta: cambiar los supuestos en pantalla, abrir una sección, descargar un CSV o
    refrescar los planes guardados."""

    type: Literal["action"] = "action"
    action: Literal["set_parameters", "navigate", "download_csv", "plans_changed"]
    parameters: Parameters | None = None
    path: str | None = None
    table: Literal["model", "version"] | None = None
    plan_id: str | None = None
    plan_name: str | None = None


class ActionRequest(BaseModel):
    name: str
    args: dict[str, Any]
    description: str


class InterruptEvent(BaseModel):
    """El agente se detuvo antes de una acción que requiere aprobación; se reanuda con /resume."""

    type: Literal["interrupt"] = "interrupt"
    requests: list[ActionRequest]


class ChartEvent(BaseModel):
    type: Literal["chart"] = "chart"
    title: str
    kind: Literal["bar", "line"]
    x_key: str
    series: list[dict[str, str]]
    data: list[dict[str, Any]]


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


class DoneEvent(BaseModel):
    type: Literal["done"] = "done"
