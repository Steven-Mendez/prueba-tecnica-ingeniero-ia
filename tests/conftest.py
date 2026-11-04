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
EXCEL_RENEWALS = ROOT / "data" / "raw" / "caso2_renovaciones.xlsx"
GOLDEN_QUEUE = ROOT / "outputs" / "cola_renovaciones_2026-09-15.csv"

# La app lee una copia de cada Excel (la «fuente» que alimentaría el ETL) y guarda los planes y los resultados
# registrados en carpetas temporales, así los tests no tocan los archivos del repo. Tiene que quedar antes de
# importar app.config.
TMP = Path(tempfile.mkdtemp(prefix="planificador-tests-"))
SOURCE = TMP / "fuente.xlsx"
shutil.copy(EXCEL, SOURCE)
SOURCE_RENEWALS = TMP / "fuente_caso2.xlsx"
shutil.copy(EXCEL_RENEWALS, SOURCE_RENEWALS)
os.environ["FACTORY_ORDER_EXCEL"] = str(SOURCE)
os.environ["RENEWALS_EXCEL"] = str(SOURCE_RENEWALS)
os.environ["PLANS_DIR"] = str(TMP / "planes")
os.environ["CONTACT_LOG_DIR"] = str(TMP / "contactos")
os.environ["DATA_CHECK_SECONDS"] = "0"
# El asistente se prueba con un modelo falso: nunca con una clave real (aunque haya una en .env o en el entorno)
os.environ["OPENAI_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
# Sin frontend/dist/ (no se versiona), `app.frontend()` solo avisa en modo desarrollo
os.environ.setdefault("FASTAPI_ENV", "development")


@pytest.fixture(scope="session")
def dataset():
    from app.services.factory_order.source import get_source

    return get_source().current()


@pytest.fixture(scope="session")
def renewals():
    from app.services.renewals.source import get_source

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
