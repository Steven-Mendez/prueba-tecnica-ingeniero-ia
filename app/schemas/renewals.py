"""Esquemas de la cola de renovaciones (Caso 2). `frontend/src/features/renewals/types.ts` los replica."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ContactResult = Literal[
    "Contactado", "Pide llamar después", "Cotización enviada", "Cierre", "No contesta", "Número equivocado"
]
Channel = Literal[
    "Cola telefónica", "Canal automático (WhatsApp / correo)", "Corrección de datos (teléfono inválido)"
]


class Parameters(BaseModel):
    """Supuestos del prototipo (S2.11, S2.14–S2.16). Los valores por defecto reproducen el notebook."""

    model_config = ConfigDict(extra="forbid")

    open_days: int = Field(14, ge=5, le=30, description="Días antes del vencimiento en que entra a la cola")
    deadline_days: int = Field(
        8, ge=0, le=20, description="Fecha límite para el primer contacto: días antes del vencimiento"
    )
    daily_capacity: int = Field(250, ge=50, le=1000, description="Llamadas del equipo por día hábil")
    agents: int = Field(5, ge=1, le=12, description="Gestores (capacidad por gestor y tamaño del piloto)")
    grace_days: int = Field(
        7, ge=0, le=30, description="Hasta cuántos días después del vencimiento se intenta el primer contacto"
    )
    target_window_share: float = Field(
        0.70, ge=0.1, le=1.0, description="Meta del piloto: % de primeros contactos en la ventana 8-14"
    )
    automatic_channel_rate: float | None = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Tasa de renovación esperada del canal automático sin llamada; None = la observada",
    )

    @model_validator(mode="after")
    def _deadline_before_open(self):
        if self.deadline_days >= self.open_days:
            raise ValueError(
                "La fecha límite tiene que ser posterior a la apertura (deadline_days < open_days)."
            )
        return self


class TeamMember(BaseModel):
    code: str
    name: str
    active: bool


class Derived(BaseModel):
    """Valores que salen de los datos y acotan los supuestos."""

    staffing_change_date: date
    period_start: date
    period_end: date
    months_in_period: int = Field(description="Meses de vencimientos con 5 gestores")
    default_day: date = Field(description="Día de ejemplo de la cola (el del notebook)")
    day_min: date
    day_max: date
    daily_call_target: int
    team: list[TeamMember]
    observed_automatic_rate: float = Field(
        description="Renovación observada del canal automático (con llamada)"
    )
    policies_phone_queue: int = Field(description="Pólizas de la cola telefónica en el periodo de 5 gestores")


class ParameterDefaults(BaseModel):
    parameters: Parameters
    derived: Derived


class ChannelRow(BaseModel):
    channel: Channel
    policies: int
    commission: float
    renewal_rate: float
    calls: int
    share_policies: float
    share_commission: float
    share_calls: float


class ChannelSummary(BaseModel):
    all_months: list[ChannelRow]
    period: list[ChannelRow]
    freed_calls_per_month: float = Field(description="Llamadas al mes que salen de la cola telefónica")
    calls_per_month: float


class RateTable(BaseModel):
    """Tasa de renovación en la cola telefónica por segmento y tramo de anticipación (13 meses)."""

    segments: list[str]
    buckets: list[str]
    rates: list[list[float | None]]
    counts: list[list[int]]


class ImprovementRow(BaseModel):
    segment: str
    window_rate: float
    late_rate: float
    improvement: float


class ComparisonRow(BaseModel):
    metric: str
    real: float
    simulated: float
    kind: Literal["days", "share"]


class SimulationStats(BaseModel):
    policies: int
    unassigned: int = Field(description="Pólizas sin cupo para el primer contacto antes de caducar")
    median_real: float
    median_sim: float
    share_window_real: float
    share_window_sim: float
    share_le3_real: float
    share_le3_sim: float
    share_after_real: float
    share_after_sim: float
    capacity_use_mean: float
    days_at_capacity_share: float
    opened_later_share: float = Field(description="Pólizas abiertas un día hábil después por falta de cupo")


class CapacityPoint(BaseModel):
    date: date
    first_contacts: int
    follow_ups: int
    total: int


class CapacitySensitivityRow(BaseModel):
    capacity: int
    share_window: float
    share_le3: float
    unassigned: int


class BucketShare(BaseModel):
    bucket: str
    real: float
    simulated: float


class Impact(BaseModel):
    """Comisión en la cola telefónica del periodo de 5 gestores: real, esperada y rango de ganancia mensual."""

    months: int
    potential: float
    collected: float
    collected_rate: float
    expected_real: float = Field(description="Esperada con los tramos reales (validación dentro de muestra)")
    expected_sim: float
    expected_sim_rate: float
    expected_sim_day: float = Field(description="Esperada valorando cada contacto por su día de anticipación")
    expected_sim_day_rate: float
    out_of_sample_expected: float = Field(description="Tabla de 7 gestores aplicada a los tramos reales de 5")
    deviation_814: float
    share_g03_814: float
    rate_7g: float
    floor_month: float
    target_month: float
    ceiling_low_month: float
    ceiling_high_month: float
    ceiling_day_month: float
    ceiling_7g_month: float
    reference_low_month: float = Field(description="Caída bruta de comisión al pasar de 7 a 5 gestores")
    reference_high_month: float = Field(description="Pérdida estratificada por contacto tardío (01_eda §8)")
    share_window_today: float
    share_window_sim: float
    automatic_adjustment_month: float = Field(
        description="Ajuste mensual si el canal automático renueva por debajo de lo observado (0 por defecto)"
    )


class Pilot(BaseModel):
    base_rate: float
    delta: float
    n_per_arm: int
    policies_per_agent_month: float
    policies_per_arm_month: float
    months: float
    agent_rates: dict[str, float]


class MetricRow(BaseModel):
    metric: str
    today: str
    target: str
    frequency: str


class Baseline(BaseModel):
    """El escenario con los valores por defecto, para comparar cuando se cambian supuestos."""

    floor_month: float
    target_month: float
    ceiling_low_month: float
    ceiling_high_month: float
    share_window_sim: float
    capacity_use_mean: float
    unassigned: int


class NotebookCheck(BaseModel):
    file: str
    matches: bool
    notebook_rows: int
    tool_rows: int
    differences: list[str]


class SimulationResult(BaseModel):
    data_version: str
    calculated_at: datetime
    parameters: Parameters
    derived: Derived
    channels: ChannelSummary
    rates: RateTable
    improvement: list[ImprovementRow]
    comparison: list[ComparisonRow]
    stats: SimulationStats
    buckets: list[BucketShare]
    capacity: list[CapacityPoint]
    capacity_sensitivity: list[CapacitySensitivityRow]
    impact: Impact
    pilot: Pilot
    metrics: list[MetricRow]
    warnings: list[str]
    baseline: Baseline | None = Field(
        description="Solo cuando los supuestos difieren de los valores por defecto"
    )
    notebook_check: NotebookCheck | None = Field(
        description="Solo con los valores por defecto: la cola del día de ejemplo frente al CSV del notebook"
    )


class QueueRow(BaseModel):
    policy: str
    client_id: str
    phone: str | None
    line: str
    segment: str
    insurer: str
    payment: str
    expiry: date
    days_to_expiry: int
    days_to_deadline: int
    previous_premium: float
    renewal_premium: float
    premium_change: float
    potential_commission: float
    improvement: float
    score: float
    agent: str
    calls_logged: int
    status: Literal["pending", "logged"]
    last_result: ContactResult | None = None
    logged_at: datetime | None = None
    contact_id: str | None = None


class AgentLoad(BaseModel):
    agent: str
    name: str
    pending: int
    logged: int
    score: float
    commission: float
    in_window_share: float | None = Field(description="% de registros del día en la ventana 8-14")


class LoggedStats(BaseModel):
    count: int
    effective: int
    in_window_share: float | None
    median_lead: float | None


class DailyQueue(BaseModel):
    day: date
    data_version: str
    agents: list[TeamMember]
    agent: str | None
    rows: list[QueueRow]
    total_pending: int
    total_logged: int
    by_agent: list[AgentLoad]
    capacity_per_agent: int
    logged: LoggedStats
    warnings: list[str]
    notebook_check: NotebookCheck | None


class RoutedChannel(BaseModel):
    channel: Channel
    policies: int
    commission: float


class DayOverview(BaseModel):
    day: date
    routed_today: list[RoutedChannel] = Field(description="Pólizas que entran al sistema ese día, por canal")
    pending_first_contacts: int
    follow_ups_estimate: int
    capacity: int
    load_share: float
    by_agent: list[AgentLoad]
    logged: LoggedStats
    metrics: list[MetricRow]


class ContactCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy: str = Field(min_length=3, max_length=40)
    agent: str = Field(min_length=1, max_length=8)
    result: ContactResult
    note: str = Field("", max_length=2000)
    day: date


class Contact(BaseModel):
    id: str
    policy: str
    agent: str
    result: ContactResult
    note: str
    day: date
    created_at: datetime
    data_version: str
    days_to_expiry: int
    in_window: bool
    effective: bool


class CallRow(BaseModel):
    at: datetime
    agent: str
    result: str
    duration_seconds: int
    effective: bool
    attempt_no: int


class PolicyDetail(BaseModel):
    policy: str
    channel: Channel
    in_queue_today: bool
    row: QueueRow | None
    renewed: bool
    calls: list[CallRow]
    contacts: list[Contact]
    explanation: str
    message_whatsapp: str | None
    message_email: str | None


class NotebookQueue(BaseModel):
    file: str
    day: date | None
    rows: int
    policies: list[str]
    total_score: float
    total_commission: float
