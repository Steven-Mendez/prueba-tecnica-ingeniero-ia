"""Configuración de la app, leída de variables de entorno (y de `.env` en local)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Raíz del repositorio: las rutas a archivos se resuelven desde aquí y no desde el directorio de trabajo,
# así que da igual desde dónde se lance `fastapi dev` o cómo arranque FastAPI Cloud.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
# Modelos que ofrece el selector del chat por proveedor (el primero es el de defecto); AGENT_MODELS los sustituye
AGENT_MODEL_OPTIONS = {
    "openai": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5-mini"],
    "anthropic": ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
}
AGENT_DEFAULT_MODELS = {p: m[0] for p, m in AGENT_MODEL_OPTIONS.items()}


class Settings(BaseSettings):
    app_name: str = "Prototipos · Casa Pellas"
    # Rutas relativas a la raíz del proyecto. Cada archivo que lea la API debe incluirse en el deploy
    # (ver .fastapicloudignore).
    # Fuentes de datos de los dos casos. En este prototipo son los Excel de cada caso, que no cambian: se leen una
    # vez al arrancar. En producción las alimentarían procesos de ETL; con DATA_CHECK_SECONDS la app revisaría cada
    # tanto si hay una versión nueva y la volvería a cargar.
    factory_order_excel: Path = Path("data/raw/caso1_vehiculos_nuevos.xlsx")
    renewals_excel: Path = Path("data/raw/caso2_renovaciones.xlsx")
    data_check_seconds: float | None = None
    # CSV que exportan los notebooks: con los datos originales y los valores por defecto, la app debe coincidir
    notebook_order_csv: Path = Path("outputs/pedido_2026-10_por_modelo.csv")
    renewals_notebook_csv: Path = Path("outputs/cola_renovaciones_2026-09-15.csv")
    # Planes guardados por el planificador (un JSON por plan) y resultados de llamada registrados desde la cola
    # de renovaciones (un JSON por registro)
    plans_dir: Path = Path("data/plans")
    contact_log_dir: Path = Path("data/contact_log")
    # Asistente (agente LangChain sobre el planificador). Funciona con OpenAI o con Anthropic: se usa el proveedor
    # que tenga clave (si hay las dos, AGENT_PROVIDER decide). Sin clave, el chat no se muestra y el resto de la app
    # funciona igual. En FastAPI Cloud las claves van en el panel de variables de entorno, nunca en el código.
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    agent_provider: Literal["auto", "openai", "anthropic"] = "auto"
    # Modelo por defecto del proveedor elegido (vacío = el primero de la lista) y lista del selector del chat
    agent_model: str | None = None
    agent_models: str | None = None

    def agent_model_options(self, provider: str) -> list[str]:
        custom = [m.strip() for m in (self.agent_models or "").split(",") if m.strip()]
        options = custom or list(AGENT_MODEL_OPTIONS[provider])
        default = self.agent_model or options[0]
        return [default] + [m for m in options if m != default]

    def agent_backend(self) -> tuple[str, str, str] | None:
        """(proveedor, modelo, clave) del asistente, o None si no hay clave."""
        keys = {"openai": self.openai_api_key, "anthropic": self.anthropic_api_key}
        provider = self.agent_provider
        if provider == "auto":
            provider = next((name for name, key in keys.items() if key), None)
        if not provider or not keys[provider]:
            return None
        return provider, self.agent_model_options(provider)[0], keys[provider]

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8")

    def resolve(self, relative: Path) -> Path:
        return relative if relative.is_absolute() else PROJECT_ROOT / relative


@lru_cache
def get_settings() -> Settings:
    return Settings()
