// Tipos espejo de app/schemas/renewals.py (cola de renovaciones, Caso 2).

export type ContactResult =
  | 'Contactado'
  | 'Pide llamar después'
  | 'Cotización enviada'
  | 'Cierre'
  | 'No contesta'
  | 'Número equivocado'

export const CONTACT_RESULTS: ContactResult[] = [
  'Contactado',
  'Pide llamar después',
  'Cotización enviada',
  'Cierre',
  'No contesta',
  'Número equivocado',
]

export type Channel = 'Cola telefónica' | 'Canal automático (WhatsApp / correo)' | 'Corrección de datos (teléfono inválido)'

export interface Parameters {
  open_days: number
  deadline_days: number
  daily_capacity: number
  agents: number
  grace_days: number
  target_window_share: number
  automatic_channel_rate: number | null
}

export interface TeamMember {
  code: string
  name: string
  active: boolean
}

export interface Derived {
  staffing_change_date: string
  period_start: string
  period_end: string
  months_in_period: number
  default_day: string
  day_min: string
  day_max: string
  daily_call_target: number
  team: TeamMember[]
  observed_automatic_rate: number
  policies_phone_queue: number
}

export interface ParameterDefaults {
  parameters: Parameters
  derived: Derived
}

export interface ChannelRow {
  channel: Channel
  policies: number
  commission: number
  renewal_rate: number
  calls: number
  share_policies: number
  share_commission: number
  share_calls: number
}

export interface ChannelSummary {
  all_months: ChannelRow[]
  period: ChannelRow[]
  freed_calls_per_month: number
  calls_per_month: number
}

export interface RateTable {
  segments: string[]
  buckets: string[]
  rates: (number | null)[][]
  counts: number[][]
}

export interface ImprovementRow {
  segment: string
  window_rate: number
  late_rate: number
  improvement: number
}

export interface ComparisonRow {
  metric: string
  real: number
  simulated: number
  kind: 'days' | 'share'
}

export interface SimulationStats {
  policies: number
  unassigned: number
  median_real: number
  median_sim: number
  share_window_real: number
  share_window_sim: number
  share_le3_real: number
  share_le3_sim: number
  share_after_real: number
  share_after_sim: number
  capacity_use_mean: number
  days_at_capacity_share: number
  opened_later_share: number
}

export interface CapacityPoint {
  date: string
  first_contacts: number
  follow_ups: number
  total: number
}

export interface CapacitySensitivityRow {
  capacity: number
  share_window: number
  share_le3: number
  unassigned: number
}

export interface BucketShare {
  bucket: string
  real: number
  simulated: number
}

export interface Impact {
  months: number
  potential: number
  collected: number
  collected_rate: number
  expected_real: number
  expected_sim: number
  expected_sim_rate: number
  expected_sim_day: number
  expected_sim_day_rate: number
  out_of_sample_expected: number
  deviation_814: number
  share_g03_814: number
  rate_7g: number
  floor_month: number
  target_month: number
  ceiling_low_month: number
  ceiling_high_month: number
  ceiling_day_month: number
  ceiling_7g_month: number
  reference_low_month: number
  reference_high_month: number
  share_window_today: number
  share_window_sim: number
  automatic_adjustment_month: number
}

export interface Pilot {
  base_rate: number
  delta: number
  n_per_arm: number
  policies_per_agent_month: number
  policies_per_arm_month: number
  months: number
  agent_rates: Record<string, number>
}

export interface MetricRow {
  metric: string
  today: string
  target: string
  frequency: string
}

export interface Baseline {
  floor_month: number
  target_month: number
  ceiling_low_month: number
  ceiling_high_month: number
  share_window_sim: number
  capacity_use_mean: number
  unassigned: number
}

export interface NotebookCheck {
  file: string
  matches: boolean
  notebook_rows: number
  tool_rows: number
  differences: string[]
}

export interface SimulationResult {
  data_version: string
  calculated_at: string
  parameters: Parameters
  derived: Derived
  channels: ChannelSummary
  rates: RateTable
  improvement: ImprovementRow[]
  comparison: ComparisonRow[]
  stats: SimulationStats
  buckets: BucketShare[]
  capacity: CapacityPoint[]
  capacity_sensitivity: CapacitySensitivityRow[]
  impact: Impact
  pilot: Pilot
  metrics: MetricRow[]
  warnings: string[]
  baseline: Baseline | null
  notebook_check: NotebookCheck | null
}

export interface QueueRow {
  policy: string
  client_id: string
  phone: string | null
  line: string
  segment: string
  insurer: string
  payment: string
  expiry: string
  days_to_expiry: number
  days_to_deadline: number
  previous_premium: number
  renewal_premium: number
  premium_change: number
  potential_commission: number
  improvement: number
  score: number
  agent: string
  calls_logged: number
  status: 'pending' | 'logged'
  last_result: ContactResult | null
  logged_at: string | null
  contact_id: string | null
}

export interface AgentLoad {
  agent: string
  name: string
  pending: number
  logged: number
  score: number
  commission: number
  in_window_share: number | null
}

export interface LoggedStats {
  count: number
  effective: number
  in_window_share: number | null
  median_lead: number | null
}

export interface DailyQueue {
  day: string
  data_version: string
  agents: TeamMember[]
  agent: string | null
  rows: QueueRow[]
  total_pending: number
  total_logged: number
  by_agent: AgentLoad[]
  capacity_per_agent: number
  logged: LoggedStats
  warnings: string[]
  notebook_check: NotebookCheck | null
}

export interface RoutedChannel {
  channel: Channel
  policies: number
  commission: number
}

export interface DayOverview {
  day: string
  routed_today: RoutedChannel[]
  pending_first_contacts: number
  follow_ups_estimate: number
  capacity: number
  load_share: number
  by_agent: AgentLoad[]
  logged: LoggedStats
  metrics: MetricRow[]
}

export interface ContactCreate {
  policy: string
  agent: string
  result: ContactResult
  note: string
  day: string
}

export interface Contact {
  id: string
  policy: string
  agent: string
  result: ContactResult
  note: string
  day: string
  created_at: string
  data_version: string
  days_to_expiry: number
  in_window: boolean
  effective: boolean
}

export interface CallRow {
  at: string
  agent: string
  result: string
  duration_seconds: number
  effective: boolean
  attempt_no: number
}

export interface PolicyDetail {
  policy: string
  channel: Channel
  in_queue_today: boolean
  row: QueueRow | null
  renewed: boolean
  calls: CallRow[]
  contacts: Contact[]
  explanation: string
  message_whatsapp: string | null
  message_email: string | null
}

export interface NotebookQueue {
  file: string
  day: string | null
  rows: number
  policies: string[]
  total_score: number
  total_commission: number
}
