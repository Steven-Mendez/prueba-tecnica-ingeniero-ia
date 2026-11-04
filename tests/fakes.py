"""Modelo de lenguaje falso para probar el cableado del asistente (herramientas, acciones, stream), no a Claude."""

import json

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk

from app.main import app
from app.routers.agent import model_factory

API = "/api/agent"


class ScriptedModel(GenericFakeChatModel):
    """Modelo falso con respuestas guionadas que acepta herramientas y emite cada respuesta como un solo chunk
    (el genérico no implementa bind_tools y no emite nada cuando el contenido es vacío)."""

    def bind_tools(self, tools, **kwargs):
        return self

    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        message = next(self.messages)
        if isinstance(message, str):
            message = AIMessage(content=message)
        chunks = [
            {
                "name": tc["name"],
                "args": json.dumps(tc["args"]),
                "id": tc["id"],
                "index": i,
                "type": "tool_call_chunk",
            }
            for i, tc in enumerate(message.tool_calls)
        ]
        yield ChatGenerationChunk(message=AIMessageChunk(content=message.content, tool_call_chunks=chunks))


def call(tools, name, **kwargs):
    return json.loads(tools[name].invoke(kwargs))


def read_events(response) -> list[dict]:
    return [
        json.loads(line[len("data: ") :]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def scripted_events(client, scripted, path, body):
    """Una vuelta del chat (o un resume) con un modelo guionado; devuelve los eventos del stream."""
    app.dependency_overrides[model_factory] = lambda: lambda _choice: ScriptedModel(messages=iter(scripted))
    try:
        return read_events(client.post(f"{API}/{path}", json=body))
    finally:
        app.dependency_overrides.pop(model_factory, None)
