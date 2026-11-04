// Tipos espejo de los modelos Pydantic de app/schemas/factory_order.py.

// Parámetros ------------------------------------------------------------------------------------------------

export interface LotRule {
  min_order: number
  lot_multiple: number
}

export interface ModelOverride {
  rule?: LotRule | null
  manual_adjustment?: number
  forced_order?: number | null
}

export type SafetyMonths = 'horizon' | 'gap_plus_horizon'
export type SafetySigma = 'adjusted' | 'deseasonalized'

// `null` = valor derivado de los datos (ver DerivedParameters)
export interface Parameters {
  cutoff_date: string | null
  window_close: string | null
  lead_time_days: number | null
  late_share: number | null
  end_of_life: Record<string, number> | null
  late_delay_months: number
  demand_window_months: number
  leftover_extra_months: number
  leftover_discount: number
  demand_multiplier: number
  demand_in_stock_months_only: boolean
  substitution_in_gap: boolean
  safety_months: SafetyMonths
  safety_sigma: SafetySigma
  learned_correction: boolean
  overrides: Record<string, ModelOverride>
}

export interface DerivedParameters {
  cutoff_date: string
  window_close: string
  lead_time_days: number
  late_share: number
  end_of_life: Record<string, number>
  communicated_lead_time_days: number
  sources: Record<string, string>
}

export type WindowKind = 'past' | 'current' | 'future'

// Una ventana que se puede planificar: la actual, las siguientes (con los mismos datos) o una pasada
export interface CutoffOption {
  cutoff_date: string
  window_close: string
  label: string
  kind: WindowKind
}

// Un plan guardado, resumido: el de esta ventana o uno intermedio que cuenta como tránsito
export interface PlanSummary {
  id: string
  name: string
  status: 'draft' | 'sent'
  window_close: string
  window_label: string
  arrival: string
  total_units: number
  capital_usd: number
  created_at: string
}

export interface Catalog {
  models: string[]
  rules: Record<string, LotRule>
  unit_cost_usd: Record<string, number>
  versions_by_model: Record<string, string[]>
}

export interface ParameterDefaults {
  parameters: Parameters
  derived: DerivedParameters
  catalog: Catalog
  cutoff_options: CutoffOption[]
}

// Resultado -------------------------------------------------------------------------------------------------

export interface Calendar {
  cutoff_date: string
  window_close: string
  arrival: string
  next_window_close: string
  next_arrival: string
  lead_time_days: number
  gap_months: number
  horizon_months: number
  gap_seasonal_factor: number
  horizon_seasonal_factor: number
  window_label: string
  previous_window_label: string
  horizon_label: string
  first_gap_month_label: string
}

export interface Kpis {
  total_units: number
  capital_usd: number
  previous_window_units: number
  models_with_order: number
  models_total: number
  zero_order_models: string[]
  unmet_gap_demand: number
  gap_substitution_inflow: number
  first_month_loss: number
  units_over_180_days: number
  total_safety_stock: number
  // Validación histórica (corte anterior al de los datos)
  actual_window_units: number | null
  actual_horizon_sales: number | null
  horizon_demand_total: number
}

export interface DemandRow {
  model: string
  sales_window: number
  stockout_months: number
  recoverable_lost: number
  net_substitution: number
  adjusted_demand_window: number
  monthly_demand: number
  monthly_std: number | null
  monthly_demand_in_stock_only: number | null
  adjustment_vs_sales: number | null
}

export interface EconomicsRow {
  model: string
  unit_margin_usd: number
  overstock_cost_usd: number
  service_level: number
  z: number
  end_of_life_discount: number | null
}

export interface OrderRow {
  model: string
  monthly_demand: number
  stock_at_cutoff: number
  in_transit: number
  transit_in_horizon: number
  demand_until_arrival: number
  coverage_today_months: number | null
  substitution_inflow: number
  position_at_arrival: number
  unmet_gap_demand: number
  monthly_std: number | null
  horizon_demand: number
  service_level: number
  safety_stock: number
  gross_order: number
  manual_adjustment: number
  min_order: number
  lot_multiple: number
  order: number
  computed_order: number
  forced_order: number | null
  capital_usd: number
  coverage_after_order_months: number | null
  previous_window_order: number
  actual_window_order: number | null
  actual_horizon_sales: number | null
  end_of_life: boolean
}

export type ExplanationCase = 'covered' | 'below_minimum' | 'ordered' | 'forced'

export interface Explanation {
  model: string
  case: ExplanationCase
  text: string
}

export interface VersionRow {
  model: string
  version: string
  demand_window: number
  stock_at_cutoff: number
  in_transit: number
  need_until_horizon_end: number
  shortfall: number
  order: number
}

export interface CoveredVersion {
  model: string
  version: string
  stock_at_cutoff: number
  in_transit: number
  monthly_demand: number
}

export interface Scenario {
  key: string
  name: string
  description: string
  orders: Record<string, number>
  total_units: number
  capital_usd: number
  same_as_current: boolean
}

export interface Sensitivity {
  scenarios: Scenario[]
  total_min: number
  total_max: number
  most_sensitive_model: string | null
}

export interface HistoryPoint {
  month: string
  sales: number
  recovered_demand: number
  adjusted_demand: number
  stock_end: number
  stockout: boolean
  lost_no_availability: number
}

export interface ModelHistory {
  model: string
  stockout_months: number
  adjustment_vs_sales: number | null
  points: HistoryPoint[]
}

export interface SeasonalityPoint {
  month: number
  label: string
  index: number
  in_gap: boolean
  in_horizon: boolean
}

export interface SubstitutionPair {
  wanted_model: string
  bought_model: string
  units: number
}

// Pedido con los valores por defecto y el mismo corte: referencia para medir el impacto de los cambios
export interface Baseline {
  orders: Record<string, number>
  total_units: number
  capital_usd: number
}

export interface NotebookCheck {
  file: string
  matches: boolean
  notebook_total_units: number
  notebook_capital_usd: number
  differences: { model: string; notebook: number; tool: number }[]
}

// Corrección aprendida de los ciclos pasados (sesgo real / proyectado por modelo)
export interface CorrectionInfo {
  available: boolean
  applied: boolean
  cycles_used: number
  last_window_label: string | null
  factors: Record<string, number>
}

export interface CalculationResult {
  data_version: string
  calculated_at: string
  parameters: Parameters
  derived: DerivedParameters
  calendar: Calendar
  kpis: Kpis
  demand: DemandRow[]
  economics: EconomicsRow[]
  order: OrderRow[]
  explanations: Explanation[]
  versions: VersionRow[]
  covered_versions: CoveredVersion[]
  sensitivity: Sensitivity
  history: ModelHistory[]
  seasonality: SeasonalityPoint[]
  substitutions: SubstitutionPair[]
  warnings: string[]
  correction: CorrectionInfo
  window_kind: WindowKind
  window_plans: PlanSummary[]
  pipeline: PlanSummary[]
  missing_pipeline_windows: string[]
  baseline: Baseline | null
  notebook_check: NotebookCheck | null
}

// Seguimiento: precisión del pronóstico y planes guardados --------------------------------------------------

export interface ModelOutcome {
  model: string
  projected: number
  realized: number
  realized_sales: number
  tool_order: number | null
  actual_order: number | null
}

export interface AccuracyCycle {
  cutoff_date: string
  window_close: string
  window_label: string
  horizon_label: string
  projected: number
  realized: number
  realized_sales: number
  tool_order: number
  actual_order: number | null
  wape: number | null
  bias: number | null
  models: ModelOutcome[]
}

export interface ModelAccuracy {
  model: string
  projected: number
  realized: number
  bias: number | null
  wape: number | null
  correction: number | null
}

export interface Accuracy {
  data_version: string
  cycles: AccuracyCycle[]
  models: ModelAccuracy[]
  wape: number | null
  bias: number | null
  correction_cycles: number
  next_cycle_closes: string | null
}

export type PlanStatus = 'draft' | 'sent'

export interface PlanRow {
  model: string
  order: number
  horizon_demand: number
  position_at_arrival: number
  capital_usd: number
}

export interface PlanTracking {
  state: 'pending' | 'in_progress' | 'closed'
  elapsed_share: number
  projected: number
  realized: number
  realized_sales: number
  wape: number | null
  bias: number | null
  models: ModelOutcome[]
}

export interface Plan {
  id: string
  name: string
  note: string
  status: PlanStatus
  created_at: string
  updated_at: string
  data_version: string
  data_cutoff: string
  cutoff_date: string
  window_close: string
  arrival: string
  next_arrival: string
  window_label: string
  horizon_label: string
  parameters: Parameters
  total_units: number
  capital_usd: number
  rows: PlanRow[]
  versions: VersionRow[]
  tracking: PlanTracking
}
