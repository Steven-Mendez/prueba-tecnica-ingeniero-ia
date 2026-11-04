"""La fuente de datos sigue al Excel que actualiza el ETL: recarga las versiones nuevas y resiste las rotas."""

import os

import pandas as pd
import pytest

from app.services.factory_order.base import DataError
from app.services.factory_order.source import DataSource
from tests.conftest import EXCEL, TMP, write_excel

CUTOFF_DATES = {
    "Ventas": "Fecha",
    "Inventario": "Mes (cierre)",
    "Leads": "Fecha cierre",
    "Pedidos": "Fecha pedido",
    "Comunicados": "Fecha",
}


def _as_of(raw: dict[str, pd.DataFrame], cutoff: str) -> dict[str, pd.DataFrame]:
    """El Excel como estaba un mes antes: sin los registros posteriores al corte."""
    limit = pd.Timestamp(cutoff)
    return {
        name: df[df[CUTOFF_DATES[name]] <= limit] if name in CUTOFF_DATES else df for name, df in raw.items()
    }


@pytest.fixture(scope="module")
def raw():
    return pd.read_excel(EXCEL, sheet_name=None)


def _bump_mtime(path):
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))


def test_etl_delivery_updates_the_data(raw):
    path = TMP / "etl.xlsx"
    write_excel(_as_of(raw, "2026-08-31"), path)
    source = DataSource(path, check_seconds=0)
    first = source.current()
    assert first.base.data_cutoff == pd.Timestamp("2026-08-31")

    # El ETL deja la versión del día siguiente: un mes más de datos
    write_excel(raw, path)
    _bump_mtime(path)
    second = source.current()
    assert second.id != first.id
    assert second.base.data_cutoff == pd.Timestamp("2026-09-30")
    assert source.status().last_error is None


def test_broken_delivery_keeps_last_good_version(raw):
    path = TMP / "etl_roto.xlsx"
    write_excel(raw, path)
    source = DataSource(path, check_seconds=0)
    good = source.current()

    path.write_bytes(b"archivo a medio escribir")
    _bump_mtime(path)
    assert source.current().id == good.id
    assert "no es un Excel" in source.status().last_error

    broken = dict(raw)
    del broken["Leads"]
    write_excel(broken, path)
    _bump_mtime(path)
    assert source.current().id == good.id
    assert "Faltan hojas" in source.status().last_error

    write_excel(raw, path)
    _bump_mtime(path)
    source.current()
    assert source.status().last_error is None


def test_missing_source_is_503():
    source = DataSource(TMP / "no_existe.xlsx", check_seconds=0)
    with pytest.raises(DataError) as exc:
        source.current()
    assert exc.value.status_code == 503


def test_prototype_reads_the_source_once(raw):
    # Sin intervalo de revisión (el prototipo), un cambio en el archivo no se recarga solo
    path = TMP / "una_vez.xlsx"
    write_excel(_as_of(raw, "2026-08-31"), path)
    source = DataSource(path)
    first = source.current()
    write_excel(raw, path)
    _bump_mtime(path)
    assert source.current().id == first.id
    assert source.current(force=True).id != first.id  # salvo que se pida explícitamente
