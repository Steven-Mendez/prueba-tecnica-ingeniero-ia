"""La limpieza reproduce `notebooks/caso1/00_limpieza.ipynb` y deriva los valores del ciclo desde el Excel."""

import pandas as pd
import pytest

from app.services.factory_order import cleaning
from app.services.factory_order.base import DataError
from tests.conftest import EXCEL, ROOT


def test_counts_match_notebook(dataset):
    base, summary = dataset.base, dataset.summary
    assert len(base.sales) == 4665  # sin las filas duplicadas (S1.1)
    assert int(base.sales["is_credit_note"].sum()) == 9  # S1.2
    assert int(base.sales["special_fleet"].sum()) == 2  # S1.3
    assert int(base.sales["price_in_cordobas"].sum()) == 13  # S1.4
    assert len(base.leads) == 12072  # sin IDs repetidos (S1.11)
    assert len(base.rules) == 11
    assert summary.reconciliation_differences == 0
    assert summary.reconciliation_cells == 385
    assert summary.warnings == []


def test_same_tables_as_notebook_pickle(dataset):
    pickle = ROOT / "data" / "processed" / "caso1_limpio.pkl"
    if not pickle.is_file():
        pytest.skip("Sin la base limpia del notebook (se genera al correr 00_limpieza)")
    nb = pd.read_pickle(pickle)
    base = dataset.base
    assert base.models == nb["models"]
    for name in ["sales", "base_sales", "inventory", "leads", "orders"]:
        pd.testing.assert_frame_equal(getattr(base, name), nb[name], check_dtype=False)
    pd.testing.assert_frame_equal(base.rules, nb["rules"], check_dtype=False)
    pd.testing.assert_frame_equal(base.economics, nb["economics"], check_dtype=False)


@pytest.mark.parametrize(
    "raw, expected",
    [("Toyota Hilux", "Hilux"), ("  HILUX ", "Hilux"), ("corolla  cross", "Corolla Cross"), ("RAV4", "RAV4")],
)
def test_normalize_model(raw, expected):
    normalize = cleaning.make_model_normalizer(["Hilux", "Corolla Cross", "RAV4"])
    assert normalize(raw) == expected


def test_parse_order_rules():
    text = (
        "cada pedido por modelo debe ser cero o cumplir el pedido mínimo, y la cantidad debe ser múltiplo del "
        "lote (mínimo / múltiplo): Hilux 12 / 6; Land Cruiser Prado 2 / 2; RAV4 4 / 4. La mezcla es libre."
    )
    comms = pd.DataFrame(
        {"Fecha": [pd.Timestamp("2025-06-03")], "Asunto": ["Pedido mínimo"], "Texto": [text]}
    )
    rules = cleaning.parse_order_rules(comms)
    assert rules.to_dict("index") == {
        "Hilux": {"min_order": 12, "lot_multiple": 6},
        "Land Cruiser Prado": {"min_order": 2, "lot_multiple": 2},
        "RAV4": {"min_order": 4, "lot_multiple": 4},
    }


def test_end_of_life_only_for_the_named_window(dataset):
    comms, models = dataset.base.communications, dataset.base.models
    assert cleaning.detect_end_of_life(comms, models, pd.Timestamp("2026-10-30")) == ["RAV4"]
    assert cleaning.detect_end_of_life(comms, models, pd.Timestamp("2027-01-29")) == []


def test_mentioned_models_prefers_longest_name():
    models = ["Corolla", "Corolla Cross", "Yaris", "Yaris Cross"]
    assert cleaning.mentioned_models("Clientes de Corolla Cross y Yaris", models) == [
        "Corolla Cross",
        "Yaris",
    ]


def test_communicated_lead_time(dataset):
    assert cleaning.communicated_lead_time_months(dataset.base.communications) == 4


def test_missing_sheet_is_a_data_error():
    raw = pd.read_excel(EXCEL, sheet_name=None)
    del raw["Leads"]
    with pytest.raises(DataError, match="Faltan hojas"):
        cleaning.clean(raw)


def test_model_outside_catalog_is_a_data_error():
    raw = pd.read_excel(EXCEL, sheet_name=None)
    raw["Ventas"].loc[0, "Modelo"] = "Supra"
    with pytest.raises(DataError, match="fuera de catálogo"):
        cleaning.clean(raw)


def test_not_an_excel():
    with pytest.raises(DataError, match="no es un Excel"):
        cleaning.read_excel(b"hola")
