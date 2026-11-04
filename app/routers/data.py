"""Rutas de la fuente de datos: estado del Excel que alimenta el ETL y cada hoja por separado."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.routers.factory_order import Dataset
from app.schemas.data import DataStatus, SheetPage
from app.services.factory_order import explorer
from app.services.factory_order.base import DataError
from app.services.factory_order.source import get_source

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/status")
def data_status(dataset: Dataset) -> DataStatus:
    """Versión de la fuente en uso, cuándo se leyó, si la última lectura falló y qué hizo la limpieza."""
    return explorer.status(dataset, get_source().status())


@router.post("/refresh")
def refresh() -> DataStatus:
    """Vuelve a leer la fuente (en producción, lo llamaría el ETL al terminar una entrega)."""
    source = get_source()
    try:
        dataset = source.current(force=True)
    except DataError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None
    return explorer.status(dataset, source.status())


@router.get("/sheets/{key}")
def sheet(
    key: str,
    dataset: Dataset,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    q: str = "",
    model: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    flag: str | None = None,
    sort: str | None = None,
    desc: bool = False,
) -> SheetPage:
    try:
        return explorer.sheet_page(
            dataset, key, page, page_size, q, model, date_from, date_to, flag, sort, desc
        )
    except DataError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None
