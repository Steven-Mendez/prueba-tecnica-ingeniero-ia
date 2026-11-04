"""Configuración de la app, leída de variables de entorno (y de `.env` en local)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Raíz del repositorio: las rutas a archivos se resuelven desde aquí y no desde el directorio de trabajo,
# así que da igual desde dónde se lance `fastapi dev` o cómo arranque FastAPI Cloud.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


class Settings(BaseSettings):
    app_name: str = "Planificador de pedidos · Casa Pellas"
    # Rutas relativas a la raíz del proyecto. Cada archivo que lea la API debe incluirse en el deploy
    # (ver .fastapicloudignore).
    # Fuente de datos del Caso 1. En este prototipo es el Excel del caso, que no cambia: se lee una vez al arrancar.
    # En producción la alimentarían procesos de ETL; con DATA_CHECK_SECONDS la app revisaría cada tanto si hay una
    # versión nueva y la volvería a cargar.
    factory_order_excel: Path = Path("data/raw/caso1_vehiculos_nuevos.xlsx")
    data_check_seconds: float | None = None
    # CSV que exporta el notebook: con los datos originales y los valores por defecto, la app debe coincidir
    notebook_order_csv: Path = Path("outputs/pedido_2026-10_por_modelo.csv")
    # Planes guardados por el planificador (un JSON por plan)
    plans_dir: Path = Path("data/plans")

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8")

    def resolve(self, relative: Path) -> Path:
        return relative if relative.is_absolute() else PROJECT_ROOT / relative


@lru_cache
def get_settings() -> Settings:
    return Settings()
