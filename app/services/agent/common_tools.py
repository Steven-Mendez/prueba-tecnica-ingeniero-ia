"""Piezas comunes a las herramientas de los dos asistentes: errores, formato y el gráfico en el chat."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from langchain.tools import tool

MAX_ROWS = 50
MAX_CHART_ROWS = 60


class ToolError(ValueError):
    """Error que se devuelve al modelo como texto para que lo corrija (parámetro inválido, póliza desconocida…)."""


def _r(x: Any, digits: int = 1) -> Any:
    if isinstance(x, bool) or x is None:
        return x
    if isinstance(x, float):
        return round(x, digits)
    return x


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


class UIContext(Protocol):
    """Lo que el runner drena hacia el frontend después de cada paso del agente."""

    actions: list[dict[str, Any]]
    charts: list[dict[str, Any]]


@dataclass(frozen=True)
class AgentSpec:
    """Lo que define a un asistente: sus herramientas, su prompt, qué herramientas piden aprobación y el
    contexto donde dejan acciones y gráficos para la UI."""

    tools: list
    system_prompt: str
    approval_tools: tuple[str, ...]
    ctx: UIContext


def chart_tool(ctx: UIContext):
    @tool
    def grafico(
        titulo: str,
        tipo: Literal["bar", "line"],
        eje_x: str,
        series: list[dict[str, str]],
        datos: list[dict[str, Any]],
    ) -> str:
        """Dibuja un gráfico en el chat con datos que ya obtuviste de otras herramientas (no inventes valores).
        `eje_x` es la clave de la categoría o del mes; `series` es una lista de {"key": clave numérica en datos,
        "label": nombre para la leyenda}; `datos` son las filas, cada una con eje_x y las claves de las series.
        Máximo 60 filas y 4 series."""
        if not series or len(series) > 4 or not datos:
            raise ToolError("Indica entre 1 y 4 series y al menos una fila.")
        if len(datos) > MAX_CHART_ROWS:
            raise ToolError(f"Máximo {MAX_CHART_ROWS} filas; agrupa o filtra los datos.")
        keys = []
        for sr in series:
            if "key" not in sr or "label" not in sr:
                raise ToolError('Cada serie necesita "key" y "label".')
            keys.append(sr["key"])
        rows = []
        for row in datos:
            if eje_x not in row:
                raise ToolError(f"Cada fila necesita la clave del eje x «{eje_x}».")
            clean = {eje_x: str(row[eje_x])}
            for k in keys:
                v = row.get(k)
                if v is not None and not isinstance(v, int | float):
                    raise ToolError(f"La serie «{k}» debe ser numérica.")
                clean[k] = v
            rows.append(clean)
        ctx.charts.append({"title": titulo, "kind": tipo, "x_key": eje_x, "series": series, "data": rows})
        return _dump({"grafico_mostrado": titulo, "filas": len(rows)})

    return grafico


def sheet_rows(page) -> dict[str, Any]:
    """Una página del explorador de hojas como JSON para el modelo."""
    keys = [c.key for c in page.columns]
    return {
        "hoja": page.sheet,
        "total_filas_que_cumplen": page.total,
        "columnas": [{"clave": c.key, "nombre": c.label, "tipo": c.type} for c in page.columns],
        "filas": [dict(zip(keys, row, strict=True)) for row in page.rows],
    }
