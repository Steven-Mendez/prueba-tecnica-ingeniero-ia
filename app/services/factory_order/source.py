"""Fuente de datos del Caso 1.

En este prototipo la fuente es el Excel del caso (`FACTORY_ORDER_EXCEL`), que no cambia: se lee y se limpia una
vez, igual que en `00_limpieza`. En producción la alimentarían procesos de ETL; con `DATA_CHECK_SECONDS` la app
revisaría cada tanto si el archivo cambió y cargaría la versión nueva. Si una entrega llegara rota o a medio
escribir, se seguiría usando la última versión buena y se informaría el error.
"""

import hashlib
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import PROJECT_ROOT, get_settings
from app.services.factory_order import cleaning
from app.services.factory_order.base import CleanBase, CleaningSummary, DataError
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


@dataclass(frozen=True)
class SourceStatus:
    path: str
    version: str | None
    loaded_at: datetime | None
    modified_at: datetime | None
    checked_at: datetime | None
    last_error: str | None
    last_error_at: datetime | None
    check_seconds: float | None


class DataSource:
    """Vigila el Excel de la fuente y entrega siempre la última versión válida."""

    def __init__(self, path: Path, check_seconds: float | None = None):
        self.path = path
        self.check_seconds = check_seconds
        self._current: LoadedDataset | None = None
        self._signature: tuple[int, int] | None = None  # (mtime_ns, tamaño) del archivo cargado o rechazado
        self._checked_at = 0.0
        self._checked_at_dt: datetime | None = None
        self._last_error: str | None = None
        self._last_error_at: datetime | None = None
        self._lock = threading.Lock()

    def current(self, force: bool = False) -> LoadedDataset:
        with self._lock:
            now = time.monotonic()
            # Sin intervalo (prototipo) solo se lee la primera vez o cuando se pide explícitamente
            due = self.check_seconds is not None and now - self._checked_at >= self.check_seconds
            if force or self._current is None or due:
                self._check()
                self._checked_at = now
                self._checked_at_dt = datetime.now(UTC)
            if self._current is None:
                raise DataError(
                    self._last_error or f"No se pudo leer la fuente de datos {self.path.name}.", 503
                )
            return self._current

    def _check(self) -> None:
        try:
            stat = self.path.stat()
        except FileNotFoundError:
            self._fail(f"No existe la fuente de datos {self._relative()}.")
            return
        signature = (stat.st_mtime_ns, stat.st_size)
        if signature == self._signature:
            return
        try:
            dataset = load_dataset(self.path)
        except DataError as exc:
            self._signature = signature  # no reintentar el mismo archivo roto en cada petición
            self._fail(exc.detail)
            return
        except (OSError, ValueError) as exc:
            # Archivo a medio escribir por el ETL: se reintenta en la próxima verificación
            self._fail(f"No se pudo leer la fuente de datos: {exc}")
            return
        self._signature = signature
        self._last_error = None
        self._last_error_at = None
        if self._current is None or dataset.id != self._current.id:
            self._current = dataset

    def _fail(self, message: str) -> None:
        self._last_error = message
        self._last_error_at = datetime.now(UTC)

    def _relative(self) -> str:
        return (
            self.path.relative_to(PROJECT_ROOT).as_posix()
            if self.path.is_relative_to(PROJECT_ROOT)
            else str(self.path)
        )

    def status(self) -> SourceStatus:
        current = self._current
        return SourceStatus(
            path=self._relative(),
            version=current.id if current else None,
            loaded_at=current.loaded_at if current else None,
            modified_at=current.modified_at if current else None,
            checked_at=self._checked_at_dt,
            last_error=self._last_error,
            last_error_at=self._last_error_at,
            check_seconds=self.check_seconds,
        )


@lru_cache
def get_source() -> DataSource:
    settings = get_settings()
    return DataSource(settings.resolve(settings.factory_order_excel), settings.data_check_seconds)
