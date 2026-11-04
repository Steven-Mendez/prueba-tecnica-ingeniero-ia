"""Resultados de llamada registrados desde la cola del día: un JSON por registro en `CONTACT_LOG_DIR`.

El registro nunca entra a la simulación (que valida contra el notebook): solo saca la póliza de la cola pendiente
del día y alimenta las métricas «registrado en la app».
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.schemas import renewals as s
from app.services.renewals.base import DataError
from app.services.renewals.engine import is_effective

_lock = threading.Lock()


class ContactLogStore:
    def __init__(self, directory: Path):
        self.directory = directory

    def _path(self, contact_id: str) -> Path:
        if not contact_id.isalnum():
            raise DataError("Identificador de registro inválido.", 404)
        return self.directory / f"{contact_id}.json"

    def _write(self, record: dict) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self._path(record["id"])
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def create(self, body: s.ContactCreate, data_version: str, days_to_expiry: int) -> dict:
        record = {
            "id": uuid.uuid4().hex[:10],
            "policy": body.policy,
            "agent": body.agent,
            "result": body.result,
            "note": body.note.strip(),
            "day": body.day.isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "data_version": data_version,
            "days_to_expiry": days_to_expiry,
            "in_window": 8 <= days_to_expiry <= 14,
            "effective": is_effective(body.result),
        }
        with _lock:
            self._write(record)
        return record

    def list(self, day: str | None = None, agent: str | None = None, policy: str | None = None) -> list[dict]:
        if not self.directory.is_dir():
            return []
        records = [json.loads(p.read_text(encoding="utf-8")) for p in self.directory.glob("*.json")]
        if day:
            records = [r for r in records if r["day"] == day]
        if agent:
            records = [r for r in records if r["agent"] == agent]
        if policy:
            records = [r for r in records if r["policy"] == policy]
        return sorted(records, key=lambda r: r["created_at"], reverse=True)

    def get(self, contact_id: str) -> dict:
        path = self._path(contact_id)
        if not path.is_file():
            raise DataError(f"No existe el registro «{contact_id}».", 404)
        return json.loads(path.read_text(encoding="utf-8"))

    def delete(self, contact_id: str) -> None:
        path = self._path(contact_id)
        if not path.is_file():
            raise DataError(f"No existe el registro «{contact_id}».", 404)
        path.unlink()

    def by_policy(self, up_to_day: str | None = None) -> dict[str, list[dict]]:
        """Registros por póliza, en orden de creación; con `up_to_day`, solo los de ese día o anteriores."""
        out: dict[str, list[dict]] = {}
        for r in sorted(self.list(), key=lambda r: r["created_at"]):
            if up_to_day is None or r["day"] <= up_to_day:
                out.setdefault(r["policy"], []).append(r)
        return out


def to_schema(record: dict) -> s.Contact:
    return s.Contact(**record)
