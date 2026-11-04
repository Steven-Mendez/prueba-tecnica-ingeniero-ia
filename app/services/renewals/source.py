"""Fuente de datos del Caso 2: el Excel de renovaciones (`RENEWALS_EXCEL`), vigilado por la `DataSource` común."""

import hashlib
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import get_settings
from app.services.common import source as common
from app.services.common.source import SourceStatus  # noqa: F401 - lo importa el explorador
from app.services.renewals import cleaning
from app.services.renewals.base import CleaningSummary, RenewalsBase

_CACHED_RESULTS = 32  # escenarios distintos (conjuntos de supuestos) que se guardan por versión


@dataclass
class LoadedRenewals:
    """Una versión de la fuente ya limpia, con caché de los escenarios simulados."""

    id: str  # versión: hash corto del contenido del archivo
    file_name: str
    loaded_at: datetime
    modified_at: datetime
    base: RenewalsBase
    summary: CleaningSummary
    raw: dict[str, pd.DataFrame]
    _cache: dict[str, Any] = field(default_factory=dict, repr=False)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def cached(self, key: str, compute: Callable[[], Any]) -> Any:
        """Resultado derivado de esta versión de los datos (se descarta solo cuando llega otra versión)."""
        with self._lock:
            if key not in self._cache:
                if len(self._cache) >= _CACHED_RESULTS:
                    self._cache.pop(next(iter(self._cache)))
                self._cache[key] = compute()
            return self._cache[key]


def load_dataset(path: Path) -> LoadedRenewals:
    content = path.read_bytes()
    raw = cleaning.read_excel(content)
    base, summary = cleaning.clean(raw)
    stat = path.stat()
    return LoadedRenewals(
        id=hashlib.sha256(content).hexdigest()[:12],
        file_name=path.name,
        loaded_at=datetime.now(UTC),
        modified_at=datetime.fromtimestamp(stat.st_mtime, UTC),
        base=base,
        summary=summary,
        raw=raw,
    )


class DataSource(common.DataSource[LoadedRenewals]):
    """Vigila el Excel del Caso 2 y entrega siempre la última versión válida."""

    def __init__(self, path: Path, check_seconds: float | None = None):
        super().__init__(path, check_seconds, load_dataset)


@lru_cache
def get_source() -> DataSource:
    settings = get_settings()
    return DataSource(settings.resolve(settings.renewals_excel), settings.data_check_seconds)
