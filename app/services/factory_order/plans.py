"""Planes guardados: el pedido que el planificador decidió en una ventana, para seguirlo cuando lleguen los datos.

Cada plan es un JSON en `PLANS_DIR` con los parámetros, el pedido por modelo y por versión y la demanda proyectada.
El seguimiento no se guarda: se recalcula con la versión actual de la fuente, así mejora solo a medida que el ETL
agrega los meses del horizonte.
"""

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from app.schemas import factory_order as s
from app.services.factory_order import calculation
from app.services.factory_order.base import DataError
from app.services.factory_order.source import LoadedDataset
from app.services.factory_order.tracking import bias, prorate, wape

_lock = threading.Lock()


class PlanStore:
    def __init__(self, directory: Path):
        self.directory = directory

    def _path(self, plan_id: str) -> Path:
        if not plan_id.isalnum():
            raise DataError("Identificador de plan inválido.", 404)
        return self.directory / f"{plan_id}.json"

    def _read(self, plan_id: str) -> dict:
        path = self._path(plan_id)
        if not path.is_file():
            raise DataError(f"No existe el plan «{plan_id}».", 404)
        return json.loads(path.read_text(encoding="utf-8"))

    def _write(self, record: dict) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self._path(record["id"])
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def create(self, dataset: LoadedDataset, body: s.PlanCreate) -> dict:
        # Los planes ya guardados cuentan como tránsito si se planifica una ventana futura
        result = calculation.calculate(dataset, body.parameters, self.list())
        now = datetime.now(UTC).isoformat()
        cal = result.calendar
        record = {
            "id": uuid.uuid4().hex[:10],
            "name": body.name.strip(),
            "note": body.note.strip(),
            "status": "draft",
            "created_at": now,
            "updated_at": now,
            "data_version": result.data_version,
            "data_cutoff": dataset.base.data_cutoff.date().isoformat(),
            "cutoff_date": cal.cutoff_date.isoformat(),
            "window_close": cal.window_close.isoformat(),
            "arrival": cal.arrival.isoformat(),
            "next_arrival": cal.next_arrival.isoformat(),
            "window_label": cal.window_label,
            "horizon_label": cal.horizon_label,
            "window_kind": result.window_kind,
            "pipeline_plan_ids": [x.id for x in result.pipeline],
            "parameters": body.parameters.model_dump(mode="json"),
            "total_units": result.kpis.total_units,
            "capital_usd": result.kpis.capital_usd,
            "rows": [
                {
                    "model": r.model,
                    "order": r.order,
                    "horizon_demand": r.horizon_demand,
                    "position_at_arrival": r.position_at_arrival,
                    "capital_usd": r.capital_usd,
                }
                for r in result.order
            ],
            "versions": [v.model_dump(mode="json") for v in result.versions],
        }
        with _lock:
            self._write(record)
        return record

    def list(self) -> list[dict]:
        if not self.directory.is_dir():
            return []
        records = [json.loads(p.read_text(encoding="utf-8")) for p in self.directory.glob("*.json")]
        return sorted(records, key=lambda r: r["created_at"], reverse=True)

    def get(self, plan_id: str) -> dict:
        return self._read(plan_id)

    def update(self, plan_id: str, body: s.PlanUpdate) -> dict:
        with _lock:
            record = self._read(plan_id)
            for field in ("name", "note", "status"):
                value = getattr(body, field)
                if value is not None:
                    record[field] = value.strip() if isinstance(value, str) else value
            record["updated_at"] = datetime.now(UTC).isoformat()
            self._write(record)
        return record

    def delete(self, plan_id: str) -> None:
        path = self._path(plan_id)
        if not path.is_file():
            raise DataError(f"No existe el plan «{plan_id}».", 404)
        path.unlink()


def track(dataset: LoadedDataset, record: dict) -> s.PlanTracking:
    """Demanda proyectada frente a la real en la parte del horizonte que ya está en los datos."""
    arrival = pd.Timestamp(record["arrival"])
    next_arrival = pd.Timestamp(record["next_arrival"])
    data_end = dataset.base.data_cutoff + pd.Timedelta(days=1)
    horizon_days = (next_arrival - arrival).days
    elapsed_end = min(next_arrival, max(arrival, data_end))
    share = (elapsed_end - arrival).days / horizon_days if horizon_days > 0 else 0.0
    state = "pending" if share <= 0 else "closed" if elapsed_end >= next_arrival else "in_progress"

    _, full = dataset.view(dataset.base.data_cutoff)
    realized = prorate(full.adjusted, arrival, elapsed_end)
    realized_sales = prorate(full.sales, arrival, elapsed_end)
    projected = pd.Series({r["model"]: r["horizon_demand"] * share for r in record["rows"]})
    orders = {r["model"]: r["order"] for r in record["rows"]}
    models = [
        s.ModelOutcome(
            model=m,
            projected=float(projected.get(m, 0.0)),
            realized=float(realized.get(m, 0.0)),
            realized_sales=float(realized_sales.get(m, 0.0)),
            tool_order=orders.get(m),
        )
        for m in projected.index
    ]
    realized = realized.reindex(projected.index).fillna(0.0)
    return s.PlanTracking(
        state=state,
        elapsed_share=share,
        projected=float(projected.sum()),
        realized=float(realized.sum()),
        realized_sales=float(realized_sales.reindex(projected.index).fillna(0.0).sum()),
        wape=wape(projected, realized) if state != "pending" else None,
        bias=bias(projected, realized) if state != "pending" else None,
        models=models,
    )


def to_schema(dataset: LoadedDataset, record: dict) -> s.Plan:
    return s.Plan(
        **{k: v for k, v in record.items() if k not in {"rows", "versions", "parameters"}},
        parameters=s.Parameters(**record["parameters"]),
        rows=[s.PlanRow(**r) for r in record["rows"]],
        versions=[s.VersionRow(**v) for v in record["versions"]],
        tracking=track(dataset, record),
    )
