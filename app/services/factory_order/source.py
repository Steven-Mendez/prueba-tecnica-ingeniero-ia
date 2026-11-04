"""Fuente de datos del Caso 1.

En este prototipo la fuente es el Excel del caso (`FACTORY_ORDER_EXCEL`), que no cambia: se lee y se limpia una
vez, igual que en `00_limpieza`. La vigilancia del archivo (versión nueva, entrega rota, última versión buena) es
la `DataSource` común de `app/services/common/source.py`; aquí va lo propio del caso: la base limpia y sus cachés.
"""

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
from app.services.common.source import SourceStatus  # noqa: F401 - lo importan el explorador y los tests
from app.services.factory_order import cleaning
from app.services.factory_order.base import CleanBase, CleaningSummary
from app.services.factory_order.model import DemandHistory, demand_history

_CACHED_CUTOFFS = 12  # cortes distintos que se guardan por versión (validación histórica y precisión)


@dataclass
class LoadedDataset:
    """Una versión de la fuente ya limpia, con cachés de lo que es caro de recalcular."""

    id: str  # versión: hash corto del contenido del archivo
    file_name: str
    loaded_at: datetime
    modified_at: datetime
    base: CleanBase
    summary: CleaningSummary
    raw: dict[str, pd.DataFrame]
    _views: dict[pd.Period, tuple[CleanBase, DemandHistory]] = field(default_factory=dict, repr=False)
    _cache: dict[str, Any] = field(default_factory=dict, repr=False)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def view(self, cutoff: pd.Timestamp) -> tuple[CleanBase, DemandHistory]:
        """Base a la fecha de corte y su historia de demanda (el paso más caro, ~0.2 s), en caché por mes."""
        key = cutoff.to_period("M")
        with self._lock:
            if key not in self._views:
                if len(self._views) >= _CACHED_CUTOFFS:
                    self._views.pop(next(iter(self._views)))
                as_of = self.base.as_of(cutoff)
                self._views[key] = (as_of, demand_history(as_of, cutoff))
            return self._views[key]

    def cached(self, key: str, compute: Callable[[], Any]) -> Any:
        """Resultado derivado de esta versión de los datos (se descarta solo cuando llega otra versión)."""
        with self._lock:
            if key not in self._cache:
                self._cache[key] = compute()
            return self._cache[key]


def load_dataset(path: Path) -> LoadedDataset:
    content = path.read_bytes()
    raw = cleaning.read_excel(content)
    base, summary = cleaning.clean(raw)
    stat = path.stat()
    return LoadedDataset(
        id=hashlib.sha256(content).hexdigest()[:12],
        file_name=path.name,
        loaded_at=datetime.now(UTC),
        modified_at=datetime.fromtimestamp(stat.st_mtime, UTC),
        base=base,
        summary=summary,
        raw=raw,
    )


class DataSource(common.DataSource[LoadedDataset]):
    """Vigila el Excel del Caso 1 y entrega siempre la última versión válida."""

    def __init__(self, path: Path, check_seconds: float | None = None):
        super().__init__(path, check_seconds, load_dataset)


@lru_cache
def get_source() -> DataSource:
    settings = get_settings()
    return DataSource(settings.resolve(settings.factory_order_excel), settings.data_check_seconds)
