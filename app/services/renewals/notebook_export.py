"""La cola del día tal como la exportó el notebook (`outputs/cola_renovaciones_<día>.csv`), como referencia.

Se lee con el módulo `csv` de la biblioteca estándar, no con el motor, para que la referencia no dependa de lo
que se está comprobando.
"""

import csv
import re
from datetime import date
from pathlib import Path

from app.schemas import renewals as s

_DAY_PATTERN = re.compile(r"(\d{4}-\d{2}-\d{2})")


def read_notebook_queue(path: Path) -> s.NotebookQueue:
    with path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    match = _DAY_PATTERN.search(path.name)
    day = date.fromisoformat(match.group(1)) if match else None
    return s.NotebookQueue(
        file=path.name,
        day=day,
        rows=len(rows),
        policies=[r["Póliza"] for r in rows],
        total_score=round(sum(float(r["Score (USD)"]) for r in rows), 2),
        total_commission=round(sum(float(r["Comisión potencial (USD)"]) for r in rows), 2),
    )
