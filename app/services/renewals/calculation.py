"""Orquesta el motor del Caso 2 y lo convierte a los esquemas de la API.

Un `Scenario` es todo lo que depende de los supuestos (`Parameters`): la cola telefónica simulada, el uso de
capacidad, la sensibilidad, el impacto y el piloto. Se guarda en caché por versión de los datos y conjunto de
supuestos. El día elegido en pantalla no entra en el escenario: solo recorta la cola. Los resultados registrados
desde la app tampoco: marcan pólizas como atendidas y alimentan las métricas «registrado en la app».
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime

import numpy as np
import pandas as pd

from app.config import get_settings
from app.schemas import renewals as s
from app.services.renewals import engine, explanation
from app.services.renewals.base import DataError
from app.services.renewals.cleaning import LEAD_TIME_LABELS
from app.services.renewals.contact_log import ContactLogStore, to_schema
from app.services.renewals.source import LoadedRenewals


@dataclass(frozen=True)
class Routed:
    """Lo que no depende de los supuestos: canales, tablas de tasas y mejora esperada."""

    ren: pd.DataFrame  # toda la cartera con `canal`
    r5: pd.DataFrame  # periodo de 5 gestores
    months_5: int
    cola_hist: pd.DataFrame  # cola telefónica, 13 meses
    tasa: pd.DataFrame
    counts: pd.DataFrame
    tasa_dia: pd.DataFrame
    mejora: pd.Series


@dataclass(frozen=True)
class Scenario:
    parameters: s.Parameters
    routed: Routed
    cola5: pd.DataFrame  # cola telefónica del periodo de 5 gestores, simulada
    uso: pd.DataFrame
    sensitivity: list[tuple[int, float, float, int]]
    impact: engine.ImpactNumbers
    pilot: engine.PilotNumbers
    warnings: list[str]


def routed(dataset: LoadedRenewals) -> Routed:
    def compute() -> Routed:
        ren = dataset.base.renewals.copy()
        ren["canal"] = engine.route_channels(ren)
        r5 = ren[ren["active_agents"] == 5]
        cola_hist = ren[ren["canal"] == engine.CHANNEL_PHONE]
        tasa = engine.rate_table(cola_hist)
        return Routed(
            ren=ren,
            r5=r5,
            months_5=int(r5["expiry_month"].nunique()),
            cola_hist=cola_hist,
            tasa=tasa,
            counts=engine.count_table(cola_hist),
            tasa_dia=engine.rate_by_day(cola_hist),
            mejora=engine.improvement(tasa),
        )

    return dataset.cached("routed", compute)


def _simulate(rt: Routed, p: s.Parameters, capacity: int) -> pd.DataFrame:
    cola5 = rt.r5[rt.r5["canal"] == engine.CHANNEL_PHONE].copy()
    cola5["primer_contacto_simulado"] = engine.simulate_queue(
        cola5, capacity, p.open_days, p.deadline_days, p.grace_days, rt.mejora
    )
    cola5["lead_simulado"], cola5["bucket_simulado"] = engine.simulated_lead(cola5)
    return cola5


def _sensitivity_row(cola: pd.DataFrame, capacity: int) -> tuple[int, float, float, int]:
    return (
        capacity,
        float(engine.in_window(cola["bucket_simulado"]).mean()),
        float((cola["lead_simulado"] <= 3).mean()),
        int(cola["primer_contacto_simulado"].isna().sum()),
    )


def resolve(dataset: LoadedRenewals, p: s.Parameters) -> Scenario:
    def compute() -> Scenario:
        rt = routed(dataset)
        cola5 = _simulate(rt, p, p.daily_capacity)
        uso = engine.capacity_usage(cola5, dataset.base.staffing_change_date)
        sensitivity = [_sensitivity_row(cola5, p.daily_capacity)]
        for cap in engine.SENSITIVITY_CAPACITIES:
            if cap != p.daily_capacity:
                sensitivity.append(_sensitivity_row(_simulate(rt, p, cap), cap))
        impact = engine.impact(
            rt.ren,
            rt.r5,
            cola5,
            rt.tasa,
            rt.tasa_dia,
            rt.months_5,
            p.target_window_share,
            p.automatic_channel_rate,
        )
        pilot = engine.pilot_size(cola5, rt.months_5, p.agents)
        warnings = []
        unassigned = int(cola5["primer_contacto_simulado"].isna().sum())
        if unassigned:
            warnings.append(
                f"{unassigned:,} pólizas se quedan sin cupo para el primer contacto antes de caducar: la capacidad "
                f"de {p.daily_capacity} llamadas al día no alcanza con estos supuestos."
            )
        if p.automatic_channel_rate is not None:
            warnings.append(
                "El canal automático se valora con la tasa indicada en vez de la observada: el ajuste mensual se "
                "muestra aparte del rango de impacto."
            )
        return Scenario(p, rt, cola5, uso, sensitivity, impact, pilot, warnings)

    return dataset.cached(f"scenario:{p.model_dump_json()}", compute)


def _defaults_used(p: s.Parameters) -> bool:
    return p == s.Parameters()


# --- Derivados y supuestos -----------------------------------------------------------------------------------


def team_members(dataset: LoadedRenewals) -> list[s.TeamMember]:
    team = dataset.base.team
    return [
        s.TeamMember(code=str(r["Código"]), name=str(r["Nombre"]), active=str(r["Estado"]) == "Activo")
        for _, r in team.iterrows()
    ]


def derived(dataset: LoadedRenewals) -> s.Derived:
    base = dataset.base
    rt = routed(dataset)
    auto5 = rt.r5[rt.r5["canal"] == engine.CHANNEL_AUTO]
    return s.Derived(
        staffing_change_date=base.staffing_change_date.date(),
        period_start=base.period_start.date(),
        period_end=base.period_end.date(),
        months_in_period=rt.months_5,
        default_day=min(max(engine.EXAMPLE_DAY, base.staffing_change_date), base.period_end).date(),
        day_min=base.staffing_change_date.date(),
        day_max=base.period_end.date(),
        daily_call_target=base.daily_call_target,
        team=team_members(dataset),
        observed_automatic_rate=float(auto5["renewed"].mean()) if len(auto5) else 0.0,
        policies_phone_queue=int((rt.r5["canal"] == engine.CHANNEL_PHONE).sum()),
    )


def parameter_defaults(dataset: LoadedRenewals) -> s.ParameterDefaults:
    return s.ParameterDefaults(parameters=s.Parameters(), derived=derived(dataset))


def validate_day(dataset: LoadedRenewals, day: date) -> pd.Timestamp:
    ts = pd.Timestamp(day)
    base = dataset.base
    if ts.weekday() >= 5:
        raise DataError(
            f"{day.isoformat()} es fin de semana: la cola se arma por día hábil (lunes a viernes)."
        )
    if ts < base.staffing_change_date or ts > base.period_end:
        raise DataError(
            f"El día tiene que estar en el periodo de 5 gestores: entre {base.staffing_change_date.date()} y "
            f"{base.period_end.date()}."
        )
    return ts


# --- Simulación e impacto ------------------------------------------------------------------------------------


def _channel_rows(t: pd.DataFrame) -> list[s.ChannelRow]:
    return [
        s.ChannelRow(
            channel=str(channel),
            policies=int(r["polizas"]),
            commission=float(r["comision_potencial"]),
            renewal_rate=float(r["tasa_renovacion"]),
            calls=int(r["llamadas_historicas"]),
            share_policies=float(r["% pólizas"]),
            share_commission=float(r["% comisión"]),
            share_calls=float(r["% llamadas"]),
        )
        for channel, r in t.iterrows()
    ]


def _none_if_nan(x) -> float | None:
    return None if pd.isna(x) else float(x)


def _share(series: pd.Series) -> dict[str, float]:
    return series.value_counts(normalize=True).reindex(LEAD_TIME_LABELS).fillna(0).to_dict()


def _impact_schema(sc: Scenario) -> s.Impact:
    i = sc.impact
    m = i.months
    return s.Impact(
        months=m,
        potential=i.potential,
        collected=i.collected,
        collected_rate=i.collected_rate,
        expected_real=i.expected_real,
        expected_sim=i.expected_sim,
        expected_sim_rate=i.expected_sim_rate,
        expected_sim_day=i.expected_sim_day,
        expected_sim_day_rate=i.expected_sim_day_rate,
        out_of_sample_expected=i.out_of_sample_expected,
        deviation_814=i.deviation_814,
        share_g03_814=i.share_g03_814,
        rate_7g=i.rate_7g,
        floor_month=i.floor / m,
        target_month=i.target / m,
        ceiling_low_month=i.ceiling_low / m,
        ceiling_high_month=i.ceiling / m,
        ceiling_day_month=i.ceiling_day / m,
        ceiling_7g_month=i.ceiling_7g / m,
        reference_low_month=i.gross_drop_month,
        reference_high_month=i.late_loss_month,
        share_window_today=i.share_window_today,
        share_window_sim=i.share_window_sim,
        automatic_adjustment_month=i.automatic_adjustment_month,
    )


def _stats(sc: Scenario) -> s.SimulationStats:
    c, p = sc.cola5, sc.parameters
    return s.SimulationStats(
        policies=len(c),
        unassigned=int(c["primer_contacto_simulado"].isna().sum()),
        median_real=float(c["lead_days"].median()),
        median_sim=float(c["lead_simulado"].median()),
        share_window_real=float(engine.in_window(c["lead_bucket"]).mean()),
        share_window_sim=float(engine.in_window(c["bucket_simulado"]).mean()),
        share_le3_real=float((c["lead_days"] <= 3).mean()),
        share_le3_sim=float((c["lead_simulado"] <= 3).mean()),
        share_after_real=float((c["lead_days"] < 0).mean()),
        share_after_sim=float((c["lead_simulado"] < 0).mean()),
        capacity_use_mean=float(sc.uso["total"].mean() / p.daily_capacity) if len(sc.uso) else 0.0,
        days_at_capacity_share=float((sc.uso["total"] >= p.daily_capacity - 1).mean())
        if len(sc.uso)
        else 0.0,
        opened_later_share=engine.opened_later_share(c, p.open_days),
    )


def _comparison(stats: s.SimulationStats) -> list[s.ComparisonRow]:
    return [
        s.ComparisonRow(
            metric="Anticipación mediana (días)",
            real=stats.median_real,
            simulated=stats.median_sim,
            kind="days",
        ),
        s.ComparisonRow(
            metric="% primer contacto a ≤ 3 días",
            real=stats.share_le3_real,
            simulated=stats.share_le3_sim,
            kind="share",
        ),
        s.ComparisonRow(
            metric="% primer contacto en ventana 8-14",
            real=stats.share_window_real,
            simulated=stats.share_window_sim,
            kind="share",
        ),
        s.ComparisonRow(
            metric="% primer contacto después del vencimiento",
            real=stats.share_after_real,
            simulated=stats.share_after_sim,
            kind="share",
        ),
    ]


def _baseline(dataset: LoadedRenewals) -> s.Baseline:
    sc = resolve(dataset, s.Parameters())
    i, st = _impact_schema(sc), _stats(sc)
    return s.Baseline(
        floor_month=i.floor_month,
        target_month=i.target_month,
        ceiling_low_month=i.ceiling_low_month,
        ceiling_high_month=i.ceiling_high_month,
        share_window_sim=st.share_window_sim,
        capacity_use_mean=st.capacity_use_mean,
        unassigned=st.unassigned,
    )


def notebook_check(p: s.Parameters, day: pd.Timestamp, text: str) -> s.NotebookCheck | None:
    """Con los valores por defecto y el día del notebook, la cola exportada debe coincidir byte a byte."""
    if not _defaults_used(p) or day != engine.EXAMPLE_DAY:
        return None
    settings = get_settings()
    path = settings.resolve(settings.renewals_notebook_csv)
    if not path.is_file():
        return None
    reference = path.read_text(encoding="utf-8")
    tool_rows = text.count("\n") - 1
    notebook_rows = reference.count("\n") - 1
    differences: list[str] = []
    if text != reference:
        mine = {line.split(",", 1)[0] for line in text.splitlines()[1:]}
        theirs = {line.split(",", 1)[0] for line in reference.splitlines()[1:]}
        for policy in sorted(theirs - mine)[:5]:
            differences.append(f"{policy} está en el notebook y no en la herramienta")
        for policy in sorted(mine - theirs)[:5]:
            differences.append(f"{policy} está en la herramienta y no en el notebook")
        if not differences:
            differences.append("Mismas pólizas, distinto orden o valores")
    return s.NotebookCheck(
        file=path.name,
        matches=text == reference,
        notebook_rows=notebook_rows,
        tool_rows=tool_rows,
        differences=differences,
    )


def simulate(dataset: LoadedRenewals, p: s.Parameters) -> s.SimulationResult:
    sc = resolve(dataset, p)
    rt = sc.routed
    all_t, period_t = engine.channel_summary(rt.ren), engine.channel_summary(rt.r5)
    freed = float(
        period_t.loc[period_t.index != engine.CHANNEL_PHONE, "llamadas_historicas"].sum() / rt.months_5
    )
    calls_month = float(period_t["llamadas_historicas"].sum() / rt.months_5)
    stats = _stats(sc)
    real_share, sim_share = _share(sc.cola5["lead_bucket"]), _share(sc.cola5["bucket_simulado"])
    uso = sc.uso
    mejora_rows = [
        s.ImprovementRow(
            segment=str(seg),
            window_rate=float(rt.tasa.loc[seg, list(engine.WINDOW_BUCKETS)].mean()),
            late_rate=float(rt.tasa.loc[seg, engine.LATE_BUCKET]),
            improvement=float(rt.mejora[seg]),
        )
        for seg in rt.tasa.index
    ]
    metrics = engine.metrics_rows(
        rt.r5,
        sc.cola5,
        rt.months_5,
        p.agents,
        sc.impact.rate_7g,
        sc.impact.expected_sim_rate,
        p.target_window_share,
    )
    _, text = export_csv(dataset, p, engine.EXAMPLE_DAY.date()) if _defaults_used(p) else ("", "")
    return s.SimulationResult(
        data_version=dataset.id,
        calculated_at=datetime.now(UTC),
        parameters=p,
        derived=derived(dataset),
        channels=s.ChannelSummary(
            all_months=_channel_rows(all_t),
            period=_channel_rows(period_t),
            freed_calls_per_month=freed,
            calls_per_month=calls_month,
        ),
        rates=s.RateTable(
            segments=[str(x) for x in rt.tasa.index],
            buckets=[str(x) for x in rt.tasa.columns],
            rates=[[_none_if_nan(v) for v in row] for row in rt.tasa.to_numpy()],
            counts=[
                [int(v) for v in row]
                for row in rt.counts.reindex(columns=rt.tasa.columns).fillna(0).to_numpy()
            ],
        ),
        improvement=mejora_rows,
        comparison=_comparison(stats),
        stats=stats,
        buckets=[
            s.BucketShare(bucket=b, real=real_share[b], simulated=sim_share[b]) for b in LEAD_TIME_LABELS
        ],
        capacity=[
            s.CapacityPoint(
                date=d.date(),
                first_contacts=int(r["primeros contactos"]),
                follow_ups=int(r["seguimientos"]),
                total=int(r["total"]),
            )
            for d, r in uso.iterrows()
        ],
        capacity_sensitivity=[
            s.CapacitySensitivityRow(capacity=c, share_window=w, share_le3=l3, unassigned=u)
            for c, w, l3, u in sc.sensitivity
        ],
        impact=_impact_schema(sc),
        pilot=s.Pilot(
            base_rate=sc.pilot.base_rate,
            delta=sc.pilot.delta,
            n_per_arm=int(round(sc.pilot.n_per_arm)),
            policies_per_agent_month=sc.pilot.policies_per_agent_month,
            policies_per_arm_month=sc.pilot.policies_per_arm_month,
            months=sc.pilot.months,
            agent_rates=sc.pilot.agent_rates,
        ),
        metrics=[s.MetricRow(metric=m, today=h, target=t, frequency=f) for m, h, t, f in metrics],
        warnings=sc.warnings,
        baseline=None if _defaults_used(p) else _baseline(dataset),
        notebook_check=notebook_check(p, engine.EXAMPLE_DAY, text) if _defaults_used(p) else None,
    )


# --- La cola del día -----------------------------------------------------------------------------------------


def _day_queue(sc: Scenario, day: pd.Timestamp) -> pd.DataFrame:
    p = sc.parameters
    return engine.daily_queue(sc.cola5, day, sc.routed.mejora, p.open_days, p.deadline_days, p.grace_days)


def _queue_row(r: pd.Series, logs: list[dict]) -> s.QueueRow:
    last = logs[-1] if logs else None
    return s.QueueRow(
        policy=str(r["Póliza"]),
        client_id=str(r["ID cliente"]),
        phone=None if pd.isna(r["Teléfono cliente"]) else str(r["Teléfono cliente"]),
        line=str(r["Ramo"]),
        segment=str(r["Segmento"]),
        insurer=str(r["Aseguradora"]),
        payment=str(r["Forma de pago"]),
        expiry=r["Fecha de vencimiento"].date(),
        days_to_expiry=int(r["Días al vencimiento"]),
        days_to_deadline=int(r["Días para la fecha límite"]),
        previous_premium=float(r["Prima anterior (USD)"]),
        renewal_premium=float(r["Prima de renovación (USD)"]),
        premium_change=float(r["% cambio de prima"]),
        potential_commission=float(r["Comisión potencial (USD)"]),
        improvement=float(r["Mejora esperada"]),
        score=float(r["Score (USD)"]),
        agent=str(r["Gestor"]),
        calls_logged=0 if pd.isna(r["calls_logged"]) else int(r["calls_logged"]),
        status="logged" if last else "pending",
        last_result=last["result"] if last else None,
        logged_at=datetime.fromisoformat(last["created_at"]) if last else None,
        contact_id=last["id"] if last else None,
    )


def _logged_stats(records: list[dict]) -> s.LoggedStats:
    leads = [r["days_to_expiry"] for r in records]
    return s.LoggedStats(
        count=len(records),
        effective=sum(1 for r in records if r["effective"]),
        in_window_share=(sum(1 for r in records if r["in_window"]) / len(records)) if records else None,
        median_lead=float(np.median(leads)) if leads else None,
    )


def _by_agent(
    dataset: LoadedRenewals, rows: list[s.QueueRow], today_records: list[dict]
) -> list[s.AgentLoad]:
    names = {m.code: m.name for m in team_members(dataset)}
    codes = sorted({m.code for m in team_members(dataset) if m.active} | {r.agent for r in rows})
    out = []
    for code in codes:
        mine = [r for r in rows if r.agent == code]
        pending = [r for r in mine if r.status == "pending"]
        recs = [r for r in today_records if r["agent"] == code]
        out.append(
            s.AgentLoad(
                agent=code,
                name=names.get(code, code),
                pending=len(pending),
                logged=len(mine) - len(pending),
                score=float(sum(r.score for r in pending)),
                commission=float(sum(r.potential_commission for r in pending)),
                in_window_share=(sum(1 for r in recs if r["in_window"]) / len(recs)) if recs else None,
            )
        )
    return out


def queue_for_day(
    dataset: LoadedRenewals,
    p: s.Parameters,
    day: date,
    agent: str | None = None,
    contacts: ContactLogStore | None = None,
) -> s.DailyQueue:
    ts = validate_day(dataset, day)
    sc = resolve(dataset, p)
    cola_dia = _day_queue(sc, ts)
    logs = contacts.by_policy(ts.date().isoformat()) if contacts else {}
    rows = [_queue_row(r, logs.get(str(r["Póliza"]), [])) for _, r in cola_dia.iterrows()]
    today_records = contacts.list(day=ts.date().isoformat()) if contacts else []
    by_agent = _by_agent(dataset, rows, today_records)
    members = team_members(dataset)
    if agent:
        if agent not in {m.code for m in members}:
            raise DataError(f"No existe el gestor «{agent}».", 404)
        rows = [r for r in rows if r.agent == agent]
        today_records = [r for r in today_records if r["agent"] == agent]
    pending = [r for r in rows if r.status == "pending"]
    warnings = list(sc.warnings)
    _, text = engine.queue_csv(cola_dia, ts)
    return s.DailyQueue(
        day=ts.date(),
        data_version=dataset.id,
        agents=[m for m in members if m.active],
        agent=agent,
        rows=rows,
        total_pending=len(pending),
        total_logged=len(rows) - len(pending),
        by_agent=by_agent,
        capacity_per_agent=p.daily_capacity // max(p.agents, 1),
        logged=_logged_stats(today_records),
        warnings=warnings,
        notebook_check=notebook_check(p, ts, text),
    )


def day_overview(
    dataset: LoadedRenewals, p: s.Parameters, day: date, contacts: ContactLogStore | None = None
) -> s.DayOverview:
    ts = validate_day(dataset, day)
    sc = resolve(dataset, p)
    queue = queue_for_day(dataset, p, day, None, contacts)
    r5 = sc.routed.r5
    apertura_habil = (r5["Fecha de vencimiento"] - pd.Timedelta(days=p.open_days)) + pd.offsets.BDay(0)
    entering = r5[apertura_habil == ts]
    routed_today = [
        s.RoutedChannel(
            channel=channel,
            policies=int((entering["canal"] == channel).sum()),
            commission=float(entering.loc[entering["canal"] == channel, "potential_commission"].sum()),
        )
        for channel in engine.CHANNEL_ORDER
    ]
    follow_ups = int(sc.uso.loc[ts, "seguimientos"]) if ts in sc.uso.index else 0
    metrics = engine.metrics_rows(
        r5,
        sc.cola5,
        sc.routed.months_5,
        p.agents,
        sc.impact.rate_7g,
        sc.impact.expected_sim_rate,
        p.target_window_share,
    )
    return s.DayOverview(
        day=ts.date(),
        routed_today=routed_today,
        pending_first_contacts=queue.total_pending,
        follow_ups_estimate=follow_ups,
        capacity=p.daily_capacity,
        load_share=(queue.total_pending + follow_ups) / p.daily_capacity,
        by_agent=queue.by_agent,
        logged=queue.logged,
        metrics=[s.MetricRow(metric=m, today=h, target=t, frequency=f) for m, h, t, f in metrics],
    )


def export_csv(
    dataset: LoadedRenewals,
    p: s.Parameters,
    day: date,
    pending_only: bool = False,
    contacts: ContactLogStore | None = None,
) -> tuple[str, str]:
    ts = validate_day(dataset, day)
    cola_dia = _day_queue(resolve(dataset, p), ts)
    if pending_only and contacts:
        logged = set(contacts.by_policy(ts.date().isoformat()))
        cola_dia = cola_dia[~cola_dia["Póliza"].isin(logged)]
    return engine.queue_csv(cola_dia, ts)


# --- Registro de resultados y detalle de póliza ---------------------------------------------------------------


def log_contact(
    dataset: LoadedRenewals, p: s.Parameters, body: s.ContactCreate, store: ContactLogStore
) -> s.Contact:
    ts = validate_day(dataset, body.day)
    sc = resolve(dataset, p)
    policy = body.policy.strip().upper()
    match = sc.cola5[sc.cola5["Póliza"] == policy]
    if match.empty:
        raise DataError(f"La póliza «{body.policy}» no está en la cola telefónica del periodo de 5 gestores.")
    if body.agent not in {m.code for m in team_members(dataset)}:
        raise DataError(f"No existe el gestor «{body.agent}».")
    days_to_expiry = int((match["Fecha de vencimiento"].iloc[0] - ts).days)
    record = store.create(body.model_copy(update={"policy": policy}), dataset.id, days_to_expiry)
    return to_schema(record)


def policy_detail(
    dataset: LoadedRenewals,
    p: s.Parameters,
    policy: str,
    day: date,
    contacts: ContactLogStore | None = None,
) -> s.PolicyDetail:
    ts = validate_day(dataset, day)
    sc = resolve(dataset, p)
    key = policy.strip().upper()
    match = sc.routed.ren[sc.routed.ren["Póliza"] == key]
    if match.empty:
        raise DataError(f"No existe la póliza «{policy}».", 404)
    row = match.iloc[0]
    channel = str(row["canal"])
    cola_dia = _day_queue(sc, ts)
    in_queue = cola_dia[cola_dia["Póliza"] == key]
    records = contacts.list(policy=key) if contacts else []
    logs = sorted(records, key=lambda r: r["created_at"])
    calls = dataset.base.calls[dataset.base.calls["Póliza"] == key].sort_values("Fecha y hora")
    if channel == engine.CHANNEL_PHONE:
        text = explanation.explain_policy(row, sc.routed.mejora, p.open_days, p.deadline_days)
    elif channel == engine.CHANNEL_AUTO:
        text = (
            f"Póliza {key} ({row['Ramo']}, {row['Segmento']}, pago {str(row['Forma de pago']).lower()}): va al canal "
            "automático. Domiciliadas, financiadas y flotas corporativas renuevan al 87–95 % sin importar cuándo se "
            "las llame (S2.14), así que recibe un mensaje 14 días antes del vencimiento y solo entra a la cola "
            "telefónica si no responde."
        )
    else:
        text = (
            f"Póliza {key}: el teléfono registrado («{row['Teléfono cliente']}») no es válido o está compartido por "
            "decenas de clientes (S2.3). Va a corrección de datos: hay que confirmar el número antes de llamar."
        )
    return s.PolicyDetail(
        policy=key,
        channel=channel,
        in_queue_today=not in_queue.empty,
        row=_queue_row(in_queue.iloc[0], [r for r in logs if r["day"] <= ts.date().isoformat()])
        if not in_queue.empty
        else None,
        renewed=bool(row["renewed"] == 1),
        calls=[
            s.CallRow(
                at=c["Fecha y hora"].to_pydatetime(),
                agent=str(c["Gestor"]),
                result=str(c["Resultado"]),
                duration_seconds=int(c["Duración (seg)"]),
                effective=bool(c["is_effective"]),
                attempt_no=int(c["attempt_no"]),
            )
            for _, c in calls.iterrows()
        ],
        contacts=[to_schema(r) for r in logs],
        explanation=text,
        message_whatsapp=explanation.draft_message(row, "whatsapp")
        if channel == engine.CHANNEL_AUTO
        else None,
        message_email=explanation.draft_message(row, "correo") if channel == engine.CHANNEL_AUTO else None,
    )
