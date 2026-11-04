import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from app.config import FRONTEND_DIST, get_settings
from app.routers import data, factory_order, health, sales
from app.services.factory_order import tracking
from app.services.factory_order.base import DataError
from app.services.factory_order.source import get_source

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Precarga la fuente y el backtest de ciclos pasados para que la primera pantalla no espere (~3 s).
    # Si la fuente no está disponible, la app arranca igual y lo informa en /api/data/status.
    try:
        tracking.backtests(get_source().current())
    except DataError as exc:
        logger.warning("No se precargó la fuente de datos: %s", exc.detail)
    yield


app = FastAPI(
    title=get_settings().app_name,
    lifespan=lifespan,
    # La documentación también vive bajo /api para que el proxy de Vite la cubra en desarrollo.
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# Todas las rutas de API cuelgan de /api. Para agregar un endpoint: crear app/routers/<nombre>.py
# con su `router` e incluirlo aquí.
api = APIRouter(prefix="/api")
api.include_router(health.router)
api.include_router(data.router)
api.include_router(sales.router)
api.include_router(factory_order.router)
app.include_router(api)

# Frontend compilado (npm run build). Las rutas de la API tienen prioridad; el resto se busca en dist/ y,
# si es una navegación del navegador sin archivo, devuelve index.html (SPA).
# Con `fastapi dev` un dist/ ausente solo genera un aviso; en producción la app no arranca sin él.
app.frontend("/", directory=FRONTEND_DIST)
