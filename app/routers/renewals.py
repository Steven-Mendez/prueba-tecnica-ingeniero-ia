"""Rutas de la cola de renovaciones (Caso 2): fuente, supuestos y simulación, cola del día, resultados
registrados y detalle de póliza."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.config import Settings, get_settings
from app.schemas.data import RenewalsDataStatus, SheetPage
from app.schemas.renewals import (
    Contact,
    ContactCreate,
    DailyQueue,
    DayOverview,
    NotebookQueue,
    ParameterDefaults,
    Parameters,
    PolicyDetail,
    SimulationResult,
)
from app.services.renewals import calculation, explorer
from app.services.renewals.base import DataError
from app.services.renewals.contact_log import ContactLogStore, to_schema
from app.services.renewals.notebook_export import read_notebook_queue
from app.services.renewals.source import LoadedRenewals, get_source

router = APIRouter(prefix="/renewals", tags=["renewals"])


def current_dataset() -> LoadedRenewals:
    """La última versión válida de la fuente del Caso 2."""
    try:
        return get_source().current()
    except DataError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None


def contact_store(settings: Annotated[Settings, Depends(get_settings)]) -> ContactLogStore:
    return ContactLogStore(settings.resolve(settings.contact_log_dir))


Dataset = Annotated[LoadedRenewals, Depends(current_dataset)]
Contacts = Annotated[ContactLogStore, Depends(contact_store)]


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except DataError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None


# --- Fuente de datos -----------------------------------------------------------------------------------------


@router.get("/data/status")
def data_status(dataset: Dataset) -> RenewalsDataStatus:
    return explorer.status(dataset, get_source().status())


@router.post("/data/refresh")
def refresh() -> RenewalsDataStatus:
    source = get_source()
    dataset = _run(source.current, True)
    return explorer.status(dataset, source.status())


@router.get("/data/sheets/{key}")
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
    return _run(
        explorer.sheet_page, dataset, key, page, page_size, q, model, date_from, date_to, flag, sort, desc
    )


# --- Supuestos y simulación ----------------------------------------------------------------------------------


@router.get("/parameters")
def get_parameters(dataset: Dataset) -> ParameterDefaults:
    return _run(calculation.parameter_defaults, dataset)


@router.post("/simulate")
def simulate(parameters: Parameters, dataset: Dataset) -> SimulationResult:
    return _run(calculation.simulate, dataset, parameters)


# --- La cola del día -----------------------------------------------------------------------------------------


@router.post("/day")
def day_overview(parameters: Parameters, dataset: Dataset, store: Contacts, day: date) -> DayOverview:
    return _run(calculation.day_overview, dataset, parameters, day, store)


@router.post("/queue")
def queue(
    parameters: Parameters, dataset: Dataset, store: Contacts, day: date, agent: str | None = None
) -> DailyQueue:
    return _run(calculation.queue_for_day, dataset, parameters, day, agent, store)


@router.post(
    "/queue/export",
    response_class=Response,
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV de la cola del día, como el que exporta el notebook",
        }
    },
)
def export(parameters: Parameters, dataset: Dataset, store: Contacts, day: date, pending_only: bool = False):
    file_name, content = _run(calculation.export_csv, dataset, parameters, day, pending_only, store)
    return Response(
        content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.post("/policies/{policy}")
def policy_detail(
    policy: str, parameters: Parameters, dataset: Dataset, store: Contacts, day: date
) -> PolicyDetail:
    return _run(calculation.policy_detail, dataset, parameters, policy, day, store)


# --- Resultados registrados ----------------------------------------------------------------------------------


@router.get("/contacts")
def list_contacts(
    store: Contacts, day: date | None = None, agent: str | None = None, policy: str | None = None
) -> list[Contact]:
    return [to_schema(r) for r in store.list(day.isoformat() if day else None, agent, policy)]


@router.post("/contacts", status_code=status.HTTP_201_CREATED)
def create_contact(body: ContactCreate, dataset: Dataset, store: Contacts) -> Contact:
    # El registro vale para la cola con los supuestos por defecto: la póliza tiene que estar en la cola telefónica
    return _run(calculation.log_contact, dataset, Parameters(), body, store)


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: str, store: Contacts) -> None:
    _run(store.delete, contact_id)


@router.get("/notebook-queue")
def notebook_queue(settings: Annotated[Settings, Depends(get_settings)]) -> NotebookQueue:
    """La cola del día tal como la exportó el notebook (referencia para comparar)."""
    path = settings.resolve(settings.renewals_notebook_csv)
    try:
        return read_notebook_queue(path)
    except FileNotFoundError:
        raise HTTPException(
            503,
            f"No se encontró {settings.renewals_notebook_csv}; ejecuta el notebook 02_prototipo_priorizacion.",
        ) from None
