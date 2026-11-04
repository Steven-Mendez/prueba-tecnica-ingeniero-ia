"""El motor reproduce exactamente `notebooks/caso1/02_pedido_fabrica.ipynb` y sus escenarios de sensibilidad."""

import datetime as dt

import pandas as pd
import pytest

from app.schemas.factory_order import LotRule, ModelOverride, Parameters
from app.services.factory_order import calculation
from app.services.factory_order.model import cycle_dates, round_to_rules
from tests.conftest import GOLDEN_BY_MODEL, GOLDEN_BY_VERSION, read_csv_text


def test_csv_by_model_is_identical_to_notebook(dataset):
    file_name, text = calculation.export_csv(dataset, Parameters(), "model")
    assert file_name == GOLDEN_BY_MODEL.name
    assert text == GOLDEN_BY_MODEL.read_text(encoding="utf-8")


def test_csv_by_version_is_identical_to_notebook(dataset):
    file_name, text = calculation.export_csv(dataset, Parameters(), "version")
    assert file_name == GOLDEN_BY_VERSION.name
    assert text == GOLDEN_BY_VERSION.read_text(encoding="utf-8")


def test_totals(dataset):
    result = calculation.calculate(dataset, Parameters())
    assert result.kpis.total_units == 341
    assert result.kpis.capital_usd == pytest.approx(10_951_670)
    assert result.kpis.previous_window_units == 347
    assert result.kpis.units_over_180_days == 57
    assert result.kpis.zero_order_models == ["Yaris"]
    assert result.notebook_check is not None and result.notebook_check.matches


def test_sensitivity_matches_notebook(dataset):
    result = calculation.calculate(dataset, Parameters())
    totals = {sc.key: sc.total_units for sc in result.sensitivity.scenarios}
    assert totals == {
        "current": 341,
        "in_stock_mean": 377,
        "demand_minus_20": 204,
        "demand_plus_20": 486,
        "communicated_lead_time": 394,
        "no_substitution": 323,
        "safety_gap_horizon": 350,
        "deseasonalized_std": 323,
        "both_s19": 335,
    }
    assert result.sensitivity.most_sensitive_model == "Hilux"


@pytest.mark.parametrize(
    "update, total",
    [
        ({"demand_multiplier": 0.8}, 204),
        ({"demand_multiplier": 1.2}, 486),
        ({"demand_in_stock_months_only": True}, 377),
        ({"lead_time_days": 122}, 394),
        ({"substitution_in_gap": False}, 323),
        ({"safety_months": "gap_plus_horizon"}, 350),
        ({"safety_sigma": "deseasonalized"}, 323),
        ({"safety_months": "gap_plus_horizon", "safety_sigma": "deseasonalized"}, 335),
    ],
)
def test_each_lever_reproduces_its_scenario(dataset, update, total):
    result = calculation.calculate(dataset, Parameters(**update))
    assert result.kpis.total_units == total
    assert result.notebook_check is None  # ya no son los parámetros del notebook


def test_without_substitution_rav4_and_raize_drop(dataset):
    result = calculation.calculate(dataset, Parameters(substitution_in_gap=False))
    orders = {r.model: r.order for r in result.order}
    assert orders["RAV4"] == 0 and orders["Raize"] == 12


@pytest.mark.parametrize(
    "raw, minimum, lot, floor, expected",
    [
        (-3.0, 12, 6, False, 0),
        (0.0, 12, 6, False, 0),
        (5.0, 12, 6, False, 0),  # menos de la mitad del mínimo
        (6.0, 12, 6, False, 12),  # la mitad del mínimo: se pide el mínimo
        (40.56, 12, 6, False, 42),
        (20.76, 12, 6, False, 18),
        (4.15, 16, 8, False, 0),
        (12.78, 4, 4, True, 12),  # última ventana: hacia abajo
        (3.9, 4, 4, True, 0),
    ],
)
def test_round_to_rules(raw, minimum, lot, floor, expected):
    assert round_to_rules(raw, minimum, lot, floor) == expected


def test_cycle_dates():
    dates = cycle_dates(pd.Timestamp("2026-09-30"), pd.Timestamp("2026-10-30"), 104)
    assert dates.arrival == pd.Timestamp("2027-02-11")
    assert dates.next_window_close == pd.Timestamp("2027-01-29")
    assert dates.next_arrival == pd.Timestamp("2027-05-13")
    assert round(dates.gap_months, 1) == 4.4 and round(dates.horizon_months, 1) == 3.0


def test_defaults_are_derived_from_the_data(dataset):
    derived = calculation.parameter_defaults(dataset).derived
    assert derived.cutoff_date == dt.date(2026, 9, 30)
    assert derived.window_close == dt.date(2026, 10, 30)
    assert derived.lead_time_days == 104
    assert derived.late_share == pytest.approx(0.119, abs=1e-3)
    assert derived.end_of_life == {"RAV4": 0.10}
    assert derived.communicated_lead_time_days == 122


def test_overrides(dataset):
    p = Parameters(
        overrides={
            "Hilux": ModelOverride(manual_adjustment=10),
            "Yaris": ModelOverride(forced_order=16),
            "Raize": ModelOverride(rule=LotRule(min_order=4, lot_multiple=2)),
        }
    )
    result = calculation.calculate(dataset, p)
    rows = {r.model: r for r in result.order}
    assert rows["Hilux"].order == 48  # 40.56 + 10 → 48
    assert rows["Yaris"].order == 16 and rows["Yaris"].computed_order == 0
    assert rows["Yaris"].capital_usd == 16 * 19_690
    assert rows["Raize"].order == 20  # 20.76 al múltiplo de 2
    assert result.warnings == []
    assert {e.model: e.case for e in result.explanations}["Yaris"] == "forced"


def test_forced_order_breaking_the_rule_warns(dataset):
    result = calculation.calculate(dataset, Parameters(overrides={"Yaris": ModelOverride(forced_order=10)}))
    assert any("Yaris" in w and "no cumple" in w for w in result.warnings)


def test_historical_cutoff_uses_only_what_was_known(dataset):
    result = calculation.calculate(dataset, Parameters(cutoff_date=dt.date(2026, 6, 30)))
    assert result.calendar.window_label == "jul-2026"
    assert result.derived.end_of_life == {}  # el comunicado de RAV4 es de septiembre
    assert any("Validación histórica" in w for w in result.warnings)


def test_cutoff_without_inventory_photo_is_rejected(dataset):
    from app.services.factory_order.base import DataError

    with pytest.raises(DataError, match="fin de mes"):
        calculation.calculate(dataset, Parameters(cutoff_date=dt.date(2026, 9, 15)))


def test_unknown_model_is_rejected(dataset):
    from app.services.factory_order.base import DataError

    with pytest.raises(DataError, match="Modelos desconocidos"):
        calculation.calculate(dataset, Parameters(overrides={"Supra": ModelOverride(forced_order=4)}))


def test_golden_frame_tolerance(dataset):
    # Además de la igualdad textual, la tabla completa con tolerancia numérica (por si cambia el formato)
    _, text = calculation.export_csv(dataset, Parameters(), "model")
    pd.testing.assert_frame_equal(
        read_csv_text(text, 0), pd.read_csv(GOLDEN_BY_MODEL, index_col=0), atol=1e-6
    )


def test_historical_cutoff_compares_with_what_happened(dataset):
    # Corte dic-2025 → ventana ene-2026: el horizonte (may → ago 2026) ya está en los datos
    result = calculation.calculate(dataset, Parameters(cutoff_date=dt.date(2025, 12, 31)))
    assert result.kpis.actual_window_units is not None and result.kpis.actual_window_units > 0
    assert result.kpis.actual_horizon_sales is not None and result.kpis.actual_horizon_sales > 0
    # Con el corte de los datos no hay nada real con qué comparar
    current = calculation.calculate(dataset, Parameters())
    assert current.kpis.actual_window_units is None and current.kpis.actual_horizon_sales is None


def test_baseline_measures_the_impact_of_changes(dataset):
    assert calculation.calculate(dataset, Parameters()).baseline is None
    result = calculation.calculate(dataset, Parameters(lead_time_days=122))
    assert result.baseline is not None
    assert result.baseline.total_units == 341 and result.kpis.total_units == 394
    assert result.baseline.orders["Hilux"] == 42
