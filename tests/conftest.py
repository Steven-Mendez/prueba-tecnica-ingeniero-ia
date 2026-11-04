import io
import os
import shutil
import tempfile
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
EXCEL = ROOT / "data" / "raw" / "caso1_vehiculos_nuevos.xlsx"
GOLDEN_BY_MODEL = ROOT / "outputs" / "pedido_2026-10_por_modelo.csv"
GOLDEN_BY_VERSION = ROOT / "outputs" / "pedido_2026-10_por_version.csv"

# La app lee una copia del Excel (la «fuente» que alimentaría el ETL) y guarda los planes en una carpeta temporal,
# así los tests no tocan los archivos del repo. Tiene que quedar antes de importar app.config.
TMP = Path(tempfile.mkdtemp(prefix="planificador-tests-"))
SOURCE = TMP / "fuente.xlsx"
shutil.copy(EXCEL, SOURCE)
os.environ["FACTORY_ORDER_EXCEL"] = str(SOURCE)
os.environ["PLANS_DIR"] = str(TMP / "planes")
os.environ["DATA_CHECK_SECONDS"] = "0"
# Sin frontend/dist/ (no se versiona), `app.frontend()` solo avisa en modo desarrollo
os.environ.setdefault("FASTAPI_ENV", "development")


@pytest.fixture(scope="session")
def dataset():
    from app.services.factory_order.source import get_source

    return get_source().current()


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def read_csv_text(text: str, index_col) -> pd.DataFrame:
    return pd.read_csv(io.StringIO(text), index_col=index_col)


def write_excel(sheets: dict[str, pd.DataFrame], path: Path) -> None:
    """Escribe un Excel como lo dejaría el ETL (todas las hojas, sin índice)."""
    tmp = path.with_suffix(".tmp.xlsx")
    with pd.ExcelWriter(tmp) as writer:
        for name, df in sheets.items():
            df.to_excel(writer, sheet_name=name, index=False)
    tmp.replace(path)
