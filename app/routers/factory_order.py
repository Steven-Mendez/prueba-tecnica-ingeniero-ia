"""Rutas del planificador: parámetros, cálculo del pedido, exportación, precisión y planes guardados."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.config import Settings, get_settings
from app.schemas.factory_order import (
    Accuracy,
    CalculationResult,
    NotebookOrder,
    ParameterDefaults,
    Parameters,
    Plan,
    PlanCreate,
    PlanUpdate,
)
from app.services.factory_order import calculation, plans, tracking
from app.services.factory_order.base import DataError
from app.services.factory_order.notebook_export import read_notebook_order
from app.services.factory_order.source import LoadedDataset, get_source

router = APIRouter(prefix="/factory-order", tags=["factory-order"])


def current_dataset() -> LoadedDataset:
    """La última versión válida de la fuente (el Excel que alimenta el ETL)."""
    try:
        return get_source().current()
    except DataError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None


def plan_store(settings: Annotated[Settings, Depends(get_settings)]) -> plans.PlanStore:
    return plans.PlanStore(settings.resolve(settings.plans_dir))


Dataset = Annotated[LoadedDataset, Depends(current_dataset)]
Plans = Annotated[plans.PlanStore, Depends(plan_store)]


def _run(fn, *args):
    try:
        return fn(*args)
    except DataError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None


@router.get("/parameters")
def get_parameters(dataset: Dataset) -> ParameterDefaults:
    return _run(calculation.parameter_defaults, dataset)


@router.post("/calculate")
def calculate(parameters: Parameters, dataset: Dataset, store: Plans) -> CalculationResult:
    # Los planes guardados cuentan como tránsito al planificar una ventana futura
    return _run(calculation.calculate, dataset, parameters, store.list())


@router.post(
    "/export/{table}",
    response_class=Response,
    responses={
        200: {"content": {"text/csv": {}}, "description": "CSV del pedido, como el que exporta el notebook"}
    },
)
def export(table: Literal["model", "version"], parameters: Parameters, dataset: Dataset, store: Plans):
    file_name, content = _run(calculation.export_csv, dataset, parameters, table, store.list())
    return Response(
        content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.get("/accuracy")
def accuracy(dataset: Dataset) -> Accuracy:
    """Precisión del pronóstico en los ciclos pasados ya cerrados; crece con cada mes que agrega el ETL."""
    return _run(tracking.accuracy, dataset)


@router.get("/plans")
def list_plans(dataset: Dataset, store: Plans) -> list[Plan]:
    return [plans.to_schema(dataset, r) for r in store.list()]


@router.post("/plans", status_code=status.HTTP_201_CREATED)
def create_plan(body: PlanCreate, dataset: Dataset, store: Plans) -> Plan:
    record = _run(store.create, dataset, body)
    return plans.to_schema(dataset, record)


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str, dataset: Dataset, store: Plans) -> Plan:
    return plans.to_schema(dataset, _run(store.get, plan_id))


@router.patch("/plans/{plan_id}")
def update_plan(plan_id: str, body: PlanUpdate, dataset: Dataset, store: Plans) -> Plan:
    return plans.to_schema(dataset, _run(store.update, plan_id, body))


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: str, store: Plans) -> None:
    _run(store.delete, plan_id)


@router.get("/notebook-order")
def notebook_order(settings: Annotated[Settings, Depends(get_settings)]) -> NotebookOrder:
    """El pedido tal como lo exportó el notebook (referencia para comparar)."""
    path = settings.resolve(settings.notebook_order_csv)
    try:
        return read_notebook_order(path)
    except FileNotFoundError:
        raise HTTPException(
            503, f"No se encontró {settings.notebook_order_csv}; ejecuta el notebook 02_pedido_fabrica."
        ) from None
