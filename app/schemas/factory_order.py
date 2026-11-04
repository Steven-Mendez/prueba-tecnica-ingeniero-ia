"""Esquemas de la API del Caso 1 (pedido a fábrica). `frontend/src/features/factory-order/types.ts` los replica."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Parámetros ----------------------------------------------------------------------------------------------------


class LotRule(BaseModel):
    min_order: int = Field(ge=0, description="Pedido mínimo de fábrica")
    lot_multiple: int = Field(ge=1, description="Múltiplo del lote")


class ModelOverride(BaseModel):
    """Lo que los datos no saben (flotas comprometidas, lanzamientos, promociones), por modelo."""

    rule: LotRule | None = Field(None, description="Sustituye el mínimo y el múltiplo del comunicado")
    manual_adjustment: int = Field(
        0, ge=-1000, le=1000, description="Unidades que se suman al pedido bruto antes de redondear"
    )
    forced_order: int | None = Field(None, ge=0, le=5000, description="Sustituye el pedido final")


class Parameters(BaseModel):
    """Supuestos del cálculo. `None` = valor derivado de los datos (ver `DerivedParameters`)."""

    model_config = ConfigDict(extra="forbid")

    cutoff_date: date | None = Field(None, description="Fin de mes con foto de inventario")
    window_close: date | None = Field(None, description="Cierre de la ventana de pedido")
    lead_time_days: int | None = Field(None, ge=30, le=365)
    late_share: float | None = Field(None, ge=0, le=1, description="Fracción de unidades que llega tarde")
    end_of_life: dict[str, float] | None = Field(
        None, description="Modelos en su última ventana → descuento de liquidación (S1.10)"
    )
    late_delay_months: float = Field(1.0, ge=0, le=6)
    demand_window_months: int = Field(12, ge=3, le=36)
    leftover_extra_months: float = Field(3.0, ge=0, le=24)
    leftover_discount: float = Field(0.04, ge=0, le=1)
    demand_multiplier: float = Field(1.0, gt=0, le=3)
    demand_in_stock_months_only: bool = Field(
        False, description="Demanda = promedio de la venta en los meses con stock (escenario de §9)"
    )
    substitution_in_gap: bool = Field(
        True, description="Sustitución entrante mientras los donantes estén en cero"
    )
    safety_months: Literal["horizon", "gap_plus_horizon"] = "horizon"
    safety_sigma: Literal["adjusted", "deseasonalized"] = "adjusted"
    learned_correction: bool = Field(
        False, description="Corrige la demanda de cada modelo con su sesgo en los ciclos pasados ya cerrados"
    )
    overrides: dict[str, ModelOverride] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self):
        if self.cutoff_date and self.window_close and self.window_close <= self.cutoff_date:
            raise ValueError("El cierre de la ventana debe ser posterior a la fecha de corte.")
        if self.end_of_life and any(not 0 <= v <= 1 for v in self.end_of_life.values()):
            raise ValueError("Los descuentos de fin de generación van de 0 a 1.")
        return self


class DerivedParameters(BaseModel):
    """Valores que se leen de los datos cuando el parámetro viene en `None`."""

    cutoff_date: date
    window_close: date
    lead_time_days: int
    late_share: float
    end_of_life: dict[str, float]
    communicated_lead_time_days: int
    sources: dict[str, str] = Field(description="Parámetro → de dónde sale el valor")


class CutoffOption(BaseModel):
    """Una ventana que se puede planificar: la actual, las siguientes (con los mismos datos) o una pasada."""

    cutoff_date: date
    window_close: date
    label: str
    kind: Literal["past", "current", "future"] = "current"


class Catalog(BaseModel):
    models: list[str]
    rules: dict[str, LotRule]
    unit_cost_usd: dict[str, float]
    versions_by_model: dict[str, list[str]]


class ParameterDefaults(BaseModel):
    parameters: Parameters
    derived: DerivedParameters
    catalog: Catalog
    cutoff_options: list[CutoffOption]


# Resultado -----------------------------------------------------------------------------------------------------


class Calendar(BaseModel):
    cutoff_date: date
    window_close: date
    arrival: date
    next_window_close: date
    next_arrival: date
    lead_time_days: int
    gap_months: float
    horizon_months: float
    gap_seasonal_factor: float
    horizon_seasonal_factor: float
    window_label: str
    previous_window_label: str
    horizon_label: str
    first_gap_month_label: str


class Kpis(BaseModel):
    total_units: int
    capital_usd: float
    previous_window_units: int
    models_with_order: int
    models_total: int
    zero_order_models: list[str]
    unmet_gap_demand: float
    gap_substitution_inflow: float
    first_month_loss: float
    units_over_180_days: int
    total_safety_stock: float
    # Validación histórica (corte anterior al de los datos): lo que de verdad se pidió y se vendió
    actual_window_units: int | None = Field(None, description="Pedido real de la ventana calculada")
    actual_horizon_sales: float | None = Field(
        None, description="Venta real entre esta llegada y la siguiente"
    )
    horizon_demand_total: float


class DemandRow(BaseModel):
    model: str
    sales_window: float
    stockout_months: int
    recoverable_lost: float
    net_substitution: float
    adjusted_demand_window: float
    monthly_demand: float
    monthly_std: float | None
    monthly_demand_in_stock_only: float | None
    adjustment_vs_sales: float | None


class EconomicsRow(BaseModel):
    model: str
    unit_margin_usd: float
    overstock_cost_usd: float
    service_level: float
    z: float
    end_of_life_discount: float | None


class OrderRow(BaseModel):
    model: str
    monthly_demand: float
    stock_at_cutoff: float
    in_transit: float
    transit_in_horizon: float
    demand_until_arrival: float
    coverage_today_months: float | None
    substitution_inflow: float
    position_at_arrival: float
    unmet_gap_demand: float
    monthly_std: float | None
    horizon_demand: float
    service_level: float
    safety_stock: float
    gross_order: float
    manual_adjustment: float
    min_order: int
    lot_multiple: int
    order: int
    computed_order: int = Field(description="Pedido antes de forzarlo a mano")
    forced_order: int | None
    capital_usd: float
    coverage_after_order_months: float | None
    previous_window_order: int
    actual_window_order: int | None
    actual_horizon_sales: float | None
    end_of_life: bool


class Explanation(BaseModel):
    model: str
    case: Literal["covered", "below_minimum", "ordered", "forced"]
    text: str


class VersionRow(BaseModel):
    model: str
    version: str
    demand_window: float
    stock_at_cutoff: float
    in_transit: float
    need_until_horizon_end: float
    shortfall: float
    order: int


class CoveredVersion(BaseModel):
    model: str
    version: str
    stock_at_cutoff: float
    in_transit: float
    monthly_demand: float


class Scenario(BaseModel):
    key: str
    name: str
    description: str
    orders: dict[str, int]
    total_units: int
    capital_usd: float
    same_as_current: bool


class Sensitivity(BaseModel):
    scenarios: list[Scenario]
    total_min: int
    total_max: int
    most_sensitive_model: str | None


class HistoryPoint(BaseModel):
    month: str = Field(description="YYYY-MM")
    sales: float
    recovered_demand: float
    adjusted_demand: float
    stock_end: float
    stockout: bool
    lost_no_availability: float


class ModelHistory(BaseModel):
    model: str
    stockout_months: int
    adjustment_vs_sales: float | None
    points: list[HistoryPoint]


class SeasonalityPoint(BaseModel):
    month: int
    label: str
    index: float
    in_gap: bool
    in_horizon: bool


class SubstitutionPair(BaseModel):
    wanted_model: str
    bought_model: str
    units: float


class Baseline(BaseModel):
    """Pedido con los valores por defecto y el mismo corte: la referencia para medir el impacto de los cambios."""

    orders: dict[str, int]
    total_units: int
    capital_usd: float


class PlanSummary(BaseModel):
    """Un plan guardado, resumido: para mostrar el de esta ventana y los que cuentan como tránsito."""

    id: str
    name: str
    status: Literal["draft", "sent"]
    window_close: date
    window_label: str
    arrival: date
    total_units: int
    capital_usd: float
    created_at: datetime


class CorrectionInfo(BaseModel):
    """Corrección aprendida de los ciclos pasados (sesgo real / proyectado por modelo)."""

    available: bool
    applied: bool
    cycles_used: int
    last_window_label: str | None
    factors: dict[str, float]


class NotebookDifference(BaseModel):
    model: str
    notebook: int
    tool: int


class NotebookCheck(BaseModel):
    file: str
    matches: bool
    notebook_total_units: int
    notebook_capital_usd: float
    differences: list[NotebookDifference]


class CalculationResult(BaseModel):
    data_version: str = Field(description="Versión de la fuente de datos con la que se calculó")
    calculated_at: datetime
    parameters: Parameters
    derived: DerivedParameters
    calendar: Calendar
    kpis: Kpis
    demand: list[DemandRow]
    economics: list[EconomicsRow]
    order: list[OrderRow]
    explanations: list[Explanation]
    versions: list[VersionRow]
    covered_versions: list[CoveredVersion]
    sensitivity: Sensitivity
    history: list[ModelHistory]
    seasonality: list[SeasonalityPoint]
    substitutions: list[SubstitutionPair]
    warnings: list[str]
    correction: CorrectionInfo
    window_kind: Literal["past", "current", "future"] = "current"
    window_plans: list[PlanSummary] = Field(
        default_factory=list, description="Planes guardados de esta ventana"
    )
    pipeline: list[PlanSummary] = Field(
        default_factory=list,
        description="Planes guardados de ventanas intermedias que cuentan como tránsito (ventanas futuras)",
    )
    missing_pipeline_windows: list[str] = Field(
        default_factory=list,
        description="Ventanas intermedias sin plan guardado (se asume que no se pide nada)",
    )
    baseline: Baseline | None = Field(
        None, description="Solo si los parámetros difieren de los por defecto (con el mismo corte y cierre)"
    )
    notebook_check: NotebookCheck | None = Field(
        description="Solo con el Excel del repo y los parámetros por defecto: compara con el CSV del notebook"
    )


# Pedido exportado por el notebook ------------------------------------------------------------------------------


class NotebookOrderModel(BaseModel):
    """Una fila del CSV que exporta `notebooks/caso1/02_pedido_fabrica.ipynb`."""

    model: str
    monthly_demand: float
    stock_at_cutoff: float
    in_transit: float
    position_at_arrival: float
    safety_stock: float
    min_order: int
    lot_multiple: int
    order: int
    capital_usd: float
    coverage_after_order_months: float


class NotebookOrder(BaseModel):
    file: str = Field(description="CSV de outputs/ del que salen los datos")
    total_units: int
    capital_usd: float
    models: list[NotebookOrderModel]


# Seguimiento: precisión del pronóstico y planes ---------------------------------------------------------------


class ModelOutcome(BaseModel):
    model: str
    projected: float = Field(description="Demanda del horizonte proyectada")
    realized: float = Field(description="Demanda ajustada real en el horizonte")
    realized_sales: float = Field(description="Venta registrada en el horizonte")
    tool_order: int | None = None
    actual_order: int | None = None


class AccuracyCycle(BaseModel):
    cutoff_date: date
    window_close: date
    window_label: str
    horizon_label: str
    projected: float
    realized: float
    realized_sales: float
    tool_order: int
    actual_order: int | None
    wape: float | None
    bias: float | None
    models: list[ModelOutcome]


class ModelAccuracy(BaseModel):
    model: str
    projected: float
    realized: float
    bias: float | None
    wape: float | None
    correction: float | None = Field(description="Multiplicador que aplica la corrección aprendida hoy")


class Accuracy(BaseModel):
    data_version: str
    cycles: list[AccuracyCycle]
    models: list[ModelAccuracy]
    wape: float | None
    bias: float | None
    correction_cycles: int
    next_cycle_closes: date | None = Field(
        description="Cuándo termina el horizonte del próximo ciclo a medir"
    )


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str = Field("", max_length=2000)
    parameters: Parameters


class PlanUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    note: str | None = Field(None, max_length=2000)
    status: Literal["draft", "sent"] | None = None


class PlanRow(BaseModel):
    model: str
    order: int
    horizon_demand: float
    position_at_arrival: float
    capital_usd: float


class PlanTracking(BaseModel):
    state: Literal["pending", "in_progress", "closed"]
    elapsed_share: float = Field(description="Fracción del horizonte que ya está en los datos")
    projected: float
    realized: float
    realized_sales: float
    wape: float | None
    bias: float | None
    models: list[ModelOutcome]


class Plan(BaseModel):
    id: str
    name: str
    note: str
    status: Literal["draft", "sent"]
    created_at: datetime
    updated_at: datetime
    data_version: str
    data_cutoff: date
    cutoff_date: date
    window_close: date
    arrival: date
    next_arrival: date
    window_label: str
    horizon_label: str
    parameters: Parameters
    total_units: int
    capital_usd: float
    rows: list[PlanRow]
    versions: list[VersionRow]
    tracking: PlanTracking
