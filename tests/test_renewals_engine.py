"""El motor del Caso 2 reproduce `02_prototipo_priorizacion.ipynb`: la cola del día de ejemplo byte a byte y los
números de la simulación, el impacto y el piloto."""

import io
from datetime import date

import pandas as pd
import pytest
from pandas.testing import assert_frame_equal
from pydantic import ValidationError

from app.schemas.renewals import Parameters
from app.services.renewals import calculation, engine
from app.services.renewals.base import DataError
from tests.conftest import GOLDEN_QUEUE

EXAMPLE_DAY = date(2026, 9, 15)


@pytest.fixture(scope="module")
def scenario(renewals):
    return calculation.resolve(renewals, Parameters())


@pytest.fixture(scope="module")
def result(renewals):
    return calculation.simulate(renewals, Parameters())


def test_queue_csv_is_identical_to_notebook(renewals):
    name, text = calculation.export_csv(renewals, Parameters(), EXAMPLE_DAY)
    assert name == "cola_renovaciones_2026-09-15.csv"
    assert text == GOLDEN_QUEUE.read_text(encoding="utf-8")


def test_queue_golden_frame_tolerance(renewals):
    _, text = calculation.export_csv(renewals, Parameters(), EXAMPLE_DAY)
    mine = pd.read_csv(io.StringIO(text))
    golden = pd.read_csv(GOLDEN_QUEUE)
    assert_frame_equal(mine, golden, atol=1e-6)
    assert len(mine) == 116
    assert list(mine["Póliza"].head(2)) == ["CAP-DH-111156", "CAP-AU-106065"]
    assert mine["Gestor"].iloc[0] == "G04"


def test_channels(result):
    period = {r.channel: r for r in result.channels.period}
    assert period[engine.CHANNEL_PHONE].policies == 14_146
    assert period[engine.CHANNEL_AUTO].policies == 4_539
    assert period[engine.CHANNEL_FIX].policies == 386
    assert result.channels.freed_calls_per_month == pytest.approx(1108.7, abs=0.1)
    assert result.channels.calls_per_month == pytest.approx(5798.7, abs=0.1)
    all_months = {r.channel: r for r in result.channels.all_months}
    assert all_months[engine.CHANNEL_FIX].calls == 2_401


def test_rate_table_and_improvement(scenario, result):
    tasa = scenario.routed.tasa
    assert tasa.loc[["Individual", "Pyme"], "8-14"].mean() == pytest.approx(0.714, abs=1e-3)
    mejora = {r.segment: r.improvement for r in result.improvement}
    assert mejora["Individual"] == pytest.approx(0.446, abs=1e-3)
    assert mejora["Pyme"] == pytest.approx(0.457, abs=1e-3)


def test_simulation_stats(result):
    st = result.stats
    assert st.policies == 14_146
    assert st.unassigned == 0
    assert st.share_window_sim == 1.0
    assert st.share_after_sim == 0.0
    assert st.share_le3_sim == 0.0
    assert st.median_sim == 14
    assert st.share_window_real == pytest.approx(0.124, abs=0.002)
    assert st.capacity_use_mean == pytest.approx(0.83, abs=0.005)
    assert st.days_at_capacity_share == pytest.approx(0.24, abs=0.005)
    assert st.opened_later_share == pytest.approx(0.08, abs=0.005)
    assert result.derived.months_in_period == 10
    assert sum(b.simulated for b in result.buckets) == pytest.approx(1.0)
    assert len(result.capacity) > 200 and max(c.total for c in result.capacity) <= 250


def test_impact_matches_notebook(result):
    i = result.impact
    assert i.potential == pytest.approx(1_879_045, abs=1)
    assert i.collected == pytest.approx(711_460, abs=1)
    assert i.expected_real == pytest.approx(709_585, abs=1)
    assert i.expected_sim == pytest.approx(1_336_768, abs=1)
    assert i.expected_sim_day == pytest.approx(1_211_793, abs=1)
    assert i.out_of_sample_expected == pytest.approx(714_136, abs=1)
    assert i.expected_sim_rate == pytest.approx(0.709, abs=1e-3)
    assert i.expected_sim_day_rate == pytest.approx(0.642, abs=1e-3)
    assert i.collected_rate == pytest.approx(0.377, abs=1e-3)
    assert i.rate_7g == pytest.approx(0.529, abs=1e-3)
    assert i.deviation_814 == pytest.approx(-0.070, abs=1e-3)
    assert i.share_g03_814 == pytest.approx(0.72, abs=0.005)
    assert i.floor_month == pytest.approx(28_615, abs=1)
    assert i.target_month == pytest.approx(41_233, abs=1)
    assert i.ceiling_high_month == pytest.approx(62_718, abs=1)
    assert i.ceiling_day_month == pytest.approx(50_221, abs=1)
    assert i.ceiling_7g_month == pytest.approx(56_772, abs=1)
    assert i.ceiling_low_month == pytest.approx(50_221, abs=1)
    assert i.reference_low_month == pytest.approx(39_444, abs=1)
    assert i.reference_high_month == pytest.approx(45_045, abs=1)
    assert i.automatic_adjustment_month == 0
    assert result.notebook_check is not None and result.notebook_check.matches
    assert result.baseline is None
    assert result.warnings == []


def test_pilot_and_metrics(result):
    p = result.pilot
    assert p.n_per_arm == 1475
    assert p.months == pytest.approx(2.1, abs=0.05)
    assert p.policies_per_agent_month == pytest.approx(283, abs=1)
    assert max(p.agent_rates, key=p.agent_rates.get) == "G03"
    assert p.agent_rates["G03"] == pytest.approx(0.56, abs=0.005)
    assert min(p.agent_rates, key=p.agent_rates.get) == "G05"
    assert len(result.metrics) == 7
    assert result.metrics[0].today == "3 días"
    assert result.metrics[1].today == "12%"
    assert result.metrics[5].today == "179 al mes"
    assert result.metrics[6].today == "USD 42,099"


def test_capacity_sensitivity(renewals, result):
    rows = {r.capacity: r for r in result.capacity_sensitivity}
    assert list(rows) == [250, 225, 200, 180]
    assert rows[250].share_window == 1.0 and rows[225].share_window == pytest.approx(1.0, abs=0.005)
    assert rows[200].share_window == pytest.approx(0.57, abs=0.005)
    assert rows[200].unassigned == 151
    assert rows[180].unassigned == 1524
    shares = [rows[c].share_window for c in (250, 225, 200, 180)]
    assert shares == sorted(shares, reverse=True)

    low = calculation.simulate(renewals, Parameters(daily_capacity=200))
    assert low.stats.share_window_sim < 1
    assert low.notebook_check is None
    assert low.baseline is not None and low.baseline.ceiling_high_month == pytest.approx(62_718, abs=1)
    assert low.warnings and "sin cupo" in low.warnings[0]
    assert low.capacity_sensitivity[0].capacity == 200 and len(low.capacity_sensitivity) == 3


def test_open_days_12_changes_the_queue(renewals):
    q14 = calculation.queue_for_day(renewals, Parameters(), EXAMPLE_DAY)
    q12 = calculation.queue_for_day(renewals, Parameters(open_days=12), EXAMPLE_DAY)
    assert q14.total_pending == 116
    assert q12.total_pending < q14.total_pending
    assert q14.rows[0].days_to_deadline == 4
    assert q14.rows[0].policy == "CAP-DH-111156" and q14.rows[0].agent == "G04"
    assert q12.notebook_check is None and q14.notebook_check is not None and q14.notebook_check.matches
    sim12 = calculation.simulate(renewals, Parameters(open_days=12))
    assert sim12.stats.unassigned == 0 and sim12.stats.median_sim == 12


def test_invalid_parameters():
    with pytest.raises(ValidationError):
        Parameters(open_days=8, deadline_days=8)
    with pytest.raises(ValidationError):
        Parameters(daily_capacity=10)
    with pytest.raises(ValidationError):
        Parameters(foo=1)


def test_day_validation(renewals):
    with pytest.raises(DataError, match="fin de semana"):
        calculation.queue_for_day(renewals, Parameters(), date(2026, 9, 12))
    with pytest.raises(DataError, match="periodo de 5 gestores"):
        calculation.queue_for_day(renewals, Parameters(), date(2025, 11, 28))
    with pytest.raises(DataError, match="periodo de 5 gestores"):
        calculation.queue_for_day(renewals, Parameters(), date(2026, 10, 5))
    first = calculation.queue_for_day(renewals, Parameters(), date(2025, 12, 1))
    assert first.total_pending >= 0


def test_parameter_defaults(renewals):
    d = calculation.parameter_defaults(renewals)
    assert d.parameters == Parameters()
    assert d.derived.default_day == EXAMPLE_DAY
    assert d.derived.day_min == date(2025, 12, 1) and d.derived.day_max == date(2026, 9, 30)
    assert len(d.derived.team) == 7 and sum(m.active for m in d.derived.team) == 5
    assert d.derived.observed_automatic_rate == pytest.approx(0.918, abs=1e-3)
    assert d.derived.policies_phone_queue == 14_146


def test_day_overview(renewals):
    o = calculation.day_overview(renewals, Parameters(), EXAMPLE_DAY)
    assert o.capacity == 250
    assert [r.channel for r in o.routed_today] == engine.CHANNEL_ORDER
    assert o.pending_first_contacts == 116
    assert 0 <= o.load_share <= 2
    assert len(o.by_agent) == 5 and sum(a.pending for a in o.by_agent) == 116
    assert len(o.metrics) == 7
