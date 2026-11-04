"""Lectura del pedido por modelo que exporta `notebooks/caso1/02_pedido_fabrica.ipynb`.

Sirve de referencia: con el Excel del repo y los parámetros por defecto, la app debe dar exactamente lo mismo.
Usa `csv` y no pandas a propósito: no depende del motor que se quiere comparar.
"""

import csv
from pathlib import Path

from app.config import PROJECT_ROOT
from app.schemas.factory_order import NotebookOrder, NotebookOrderModel

# Columna del CSV → campo del esquema. La primera columna (sin encabezado) es el índice: el modelo.
_COLUMNS = {
    "Demanda mensual": "monthly_demand",
    "Stock al corte": "stock_at_cutoff",
    "En tránsito": "in_transit",
    "Posición al llegar": "position_at_arrival",
    "Stock de seguridad": "safety_stock",
    "Mínimo": "min_order",
    "Múltiplo": "lot_multiple",
    "Pedido": "order",
    "Capital (USD)": "capital_usd",
    "Cobertura tras el pedido (meses)": "coverage_after_order_months",
}
_INTEGERS = {"min_order", "lot_multiple", "order"}


def _value(field: str, text: str) -> float | int:
    number = float(text)
    return int(number) if field in _INTEGERS else number


def read_notebook_order(path: Path) -> NotebookOrder:
    """Lee el CSV del pedido por modelo. Lanza FileNotFoundError si no existe."""
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    models = [
        NotebookOrderModel(
            model=row[""], **{field: _value(field, row[col]) for col, field in _COLUMNS.items()}
        )
        for row in rows
    ]
    models.sort(key=lambda m: m.order, reverse=True)

    file = path.relative_to(PROJECT_ROOT) if path.is_relative_to(PROJECT_ROOT) else path
    return NotebookOrder(
        file=file.as_posix(),
        total_units=sum(m.order for m in models),
        capital_usd=round(sum(m.capital_usd for m in models), 2),
        models=models,
    )
