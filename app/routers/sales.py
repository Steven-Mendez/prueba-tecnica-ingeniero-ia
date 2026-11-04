"""Rutas del tablero de ventas."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.factory_order import Dataset
from app.schemas.sales import SalesOverview
from app.services.factory_order import sales

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("/overview")
def overview(
    dataset: Dataset,
    date_from: date | None = None,
    date_to: date | None = None,
    models: Annotated[list[str] | None, Query()] = None,
    branches: Annotated[list[str] | None, Query()] = None,
    customer_types: Annotated[list[str] | None, Query()] = None,
    include_fleet: bool = False,
) -> SalesOverview:
    """Ventas netas del periodo (por defecto, los últimos 12 meses), con la venta perdida por disponibilidad."""
    return sales.overview(dataset, date_from, date_to, models, branches, customer_types, include_fleet)
