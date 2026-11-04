"""La limpieza del Caso 2 reproduce `00_limpieza.ipynb` y rechaza lo que el notebook detiene con un assert."""

import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from app.services.renewals import cleaning
from app.services.renewals.base import DataError
from tests.conftest import ROOT, SOURCE_RENEWALS

PICKLE = ROOT / "data" / "processed" / "caso2_limpio.pkl"


def test_counts_match_notebook(renewals):
    base, summary = renewals.base, renewals.summary
    r = base.renewals
    assert len(r) == 25_200
    assert len(base.calls) == 78_058
    assert len(base.team) == 7
    assert len(base.staffing) == 2
    assert len(base.quality) == 9
    assert summary.sheets["Renovaciones"] == 25_351
    assert summary.duplicates_removed == 151
    assert summary.invalid_phones == (~r["valid_phone"]).sum() == 522
    assert (~r["phone_format_ok"]).sum() == 357
    assert (r["phone_format_ok"] & r["shared_phone"]).sum() == 165
    assert summary.first_contact_filled == 151
    assert summary.renewed_without_closing == 222
    assert summary.late_first_contacts == (r["lead_days"] < 0).sum() == 579
    assert (r["Número de intentos"] != r["calls_logged"]).sum() == 0
    assert r["lead_days"].min() == -12 and r["lead_days"].max() == 30
    assert r["lead_bucket"].isna().sum() == 0
    assert set(base.calls.loc[base.calls["is_effective"], "Resultado"]) == set(cleaning.EFFECTIVE_RESULTS)
    assert summary.warnings == []
    assert base.staffing_change_date == pd.Timestamp("2025-12-01")
    assert (base.period_start.date().isoformat(), base.period_end.date().isoformat()) == (
        "2025-09-01",
        "2026-09-30",
    )


@pytest.mark.skipif(not PICKLE.is_file(), reason="data/processed/caso2_limpio.pkl: ejecuta 00_limpieza")
def test_same_tables_as_notebook_pickle(renewals):
    nb = pd.read_pickle(PICKLE)
    for name in ("renewals", "calls", "team", "staffing", "quality"):
        assert_frame_equal(getattr(renewals.base, name), nb[name], check_dtype=False)
    assert nb["effective_results"] == cleaning.EFFECTIVE_RESULTS
    assert nb["lead_time_bins"] == cleaning.LEAD_TIME_BINS
    assert nb["lead_time_labels"] == cleaning.LEAD_TIME_LABELS
    assert nb["params"]["staffing_change_date"] == renewals.base.staffing_change_date
    assert nb["params"]["daily_call_target"] == renewals.base.daily_call_target
    assert nb["params"]["standard_lead_days"] == renewals.base.standard_lead_days


def test_split_team():
    team, staffing = cleaning.split_team(cleaning.read_excel(SOURCE_RENEWALS)["Equipo"])
    assert list(team["Código"]) == [f"G0{i}" for i in range(1, 8)]
    assert list(team["Estado"]) == ["Activo"] * 5 + ["Retirado"] * 2
    assert list(staffing.columns) == ["Periodo", "Gestores", "Códigos", "Comentario"]
    assert list(staffing["Gestores"]) == [7, 5]
    with pytest.raises(DataError, match="Periodo"):
        cleaning.split_team(team)


def test_unknown_renewed_value_is_a_data_error():
    raw = cleaning.read_excel(SOURCE_RENEWALS)
    raw["Renovaciones"] = raw["Renovaciones"].copy()
    raw["Renovaciones"].loc[0, "Renovó"] = "tal vez"
    with pytest.raises(DataError, match="no reconocido"):
        cleaning.clean(raw)


def test_missing_sheet_is_a_data_error():
    raw = cleaning.read_excel(SOURCE_RENEWALS)
    del raw["Bitacora_Llamadas"]
    with pytest.raises(DataError, match="Falta la hoja"):
        cleaning.clean(raw)


def test_not_an_excel_is_a_data_error():
    with pytest.raises(DataError, match="no es un Excel"):
        cleaning.read_excel(b"hola")
