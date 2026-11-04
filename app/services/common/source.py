"""Fuente de datos genérica: vigila un Excel y entrega siempre la última versión válida.

En este prototipo la fuente de cada caso es su Excel, que no cambia: se lee y se limpia una vez. En producción la
alimentarían procesos de ETL; con `DATA_CHECK_SECONDS` la app revisaría cada tanto si el archivo cambió y cargaría
la versión nueva. Si una entrega llegara rota o a medio escribir, se seguiría usando la última versión buena y se
informaría el error. Cada caso aporta su `loader` (lectura + limpieza) y su tipo de dataset cargado.
"""

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from app.config import PROJECT_ROOT
from app.services.common.errors import DataError


class Loaded(Protocol):
    id: str
    loaded_at: datetime
    modified_at: datetime


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


class DataSource[T: Loaded]:
    """Vigila el Excel de la fuente y entrega siempre la última versión válida."""

    def __init__(self, path: Path, check_seconds: float | None, loader: Callable[[Path], T]):
        self.path = path
        self.check_seconds = check_seconds
        self._loader = loader
        self._current: T | None = None
        self._signature: tuple[int, int] | None = None  # (mtime_ns, tamaño) del archivo cargado o rechazado
        self._checked_at = 0.0
        self._checked_at_dt: datetime | None = None
        self._last_error: str | None = None
        self._last_error_at: datetime | None = None
        self._lock = threading.Lock()

    def current(self, force: bool = False) -> T:
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
            dataset = self._loader(self.path)
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
