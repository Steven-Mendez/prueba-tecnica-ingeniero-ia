// Estado de los parámetros: `base` son los valores por defecto del conjunto de datos (los del notebook con el
// Excel del repo) y `current` lo que el planificador ajustó. Se envían tal cual a /calculate.
import type { DerivedParameters, ModelOverride, Parameters } from '../types'
import { months, num0, pct, signedPct } from '@/lib/format'

export interface ParametersState {
  version: string | null
  base: Parameters | null
  current: Parameters | null
}

type ScalarField = Exclude<keyof Parameters, 'overrides' | 'end_of_life'>

export type ParametersAction =
  // Valores por defecto de una versión de la fuente. Lo que el planificador ajustó se conserva si la fuente cambia
  // (en producción, una entrega nueva del ETL), salvo el corte y el cierre si ya no son válidos.
  | { type: 'load'; version: string; base: Parameters; saved?: Parameters | null; cutoffs: string[] }
  | { type: 'set'; field: ScalarField; value: Parameters[ScalarField] }
  // Ventana a planificar: corte (null = el de los datos) y cierre (null = la primera ventana tras el corte)
  | { type: 'setCutoff'; cutoff: string | null; window?: string | null }
  | { type: 'setEndOfLife'; value: Record<string, number> | null }
  | { type: 'setOverride'; model: string; patch: Partial<ModelOverride> }
  | { type: 'clearOverride'; model: string }
  | { type: 'clearOverrides' }
  | { type: 'resetFields'; fields: (keyof Parameters)[] }
  // Abre en el planificador los parámetros de un plan guardado
  | { type: 'replace'; parameters: Parameters }
  | { type: 'reset' }

export const initialParametersState: ParametersState = { version: null, base: null, current: null }

function isEmptyOverride(o: ModelOverride): boolean {
  return !o.rule && !o.manual_adjustment && (o.forced_order === null || o.forced_order === undefined)
}

export function parametersReducer(state: ParametersState, action: ParametersAction): ParametersState {
  if (action.type === 'load') {
    const kept = state.current ?? action.saved
    if (!kept) return { version: action.version, base: action.base, current: action.base }
    const cutoffOk = kept.cutoff_date === null || action.cutoffs.includes(kept.cutoff_date)
    const current = cutoffOk ? { ...action.base, ...kept } : { ...action.base, ...kept, cutoff_date: null, window_close: null }
    return { version: action.version, base: action.base, current }
  }
  const { base, current } = state
  if (!base || !current) return state
  switch (action.type) {
    case 'set':
      return { ...state, current: { ...current, [action.field]: action.value } }
    case 'setCutoff':
      // Al cambiar de ventana, el fin de generación vuelve a derivarse (los valores en «auto» se derivan solos)
      return {
        ...state,
        current: { ...current, cutoff_date: action.cutoff, window_close: action.window ?? null, end_of_life: null },
      }
    case 'setEndOfLife':
      return { ...state, current: { ...current, end_of_life: action.value } }
    case 'setOverride': {
      const merged: ModelOverride = { ...current.overrides[action.model], ...action.patch }
      const overrides = { ...current.overrides }
      if (isEmptyOverride(merged)) delete overrides[action.model]
      else overrides[action.model] = merged
      return { ...state, current: { ...current, overrides } }
    }
    case 'clearOverride': {
      const overrides = { ...current.overrides }
      delete overrides[action.model]
      return { ...state, current: { ...current, overrides } }
    }
    case 'clearOverrides':
      return { ...state, current: { ...current, overrides: {} } }
    case 'resetFields': {
      const next = { ...current } as Record<keyof Parameters, unknown>
      for (const f of action.fields) next[f] = base[f]
      return { ...state, current: next as unknown as Parameters }
    }
    case 'replace':
      return { ...state, current: { ...base, ...action.parameters } }
    case 'reset':
      // La ventana elegida no es un supuesto: se conserva
      return { ...state, current: { ...base, cutoff_date: current.cutoff_date, window_close: current.window_close } }
  }
}

// Campos de cada sección del panel (para restablecer solo esa sección)
export const SECTION_FIELDS = {
  cycle: ['lead_time_days', 'late_share', 'late_delay_months'],
  demand: [
    'demand_multiplier',
    'demand_window_months',
    'demand_in_stock_months_only',
    'substitution_in_gap',
    'learned_correction',
  ],
  factory: ['end_of_life'],
  safety: ['leftover_extra_months', 'leftover_discount', 'safety_months', 'safety_sigma'],
} as const satisfies Record<string, readonly (keyof Parameters)[]>

export function sectionChanged(base: Parameters, current: Parameters, fields: readonly (keyof Parameters)[]): boolean {
  return fields.some((f) => stableStringify(base[f]) !== stableStringify(current[f]))
}

// JSON con claves ordenadas: dos objetos iguales dan el mismo texto aunque se hayan editado en otro orden
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

// Campos que no son supuestos: la ventana que se planifica se elige aparte y no cuenta como cambio
const WINDOW_FIELDS: (keyof Parameters)[] = ['cutoff_date', 'window_close']

export function sameAssumptions(base: Parameters, current: Parameters): boolean {
  const strip = (p: Parameters) => Object.fromEntries(Object.entries(p).filter(([k]) => !WINDOW_FIELDS.includes(k as keyof Parameters)))
  return stableStringify(strip(base)) === stableStringify(strip(current))
}

// Etiquetas legibles de lo que cambió respecto de los valores por defecto (sin contar la ventana elegida)
export function describeChanges(base: Parameters, current: Parameters, derived: DerivedParameters | null): string[] {
  const changes: string[] = []
  const auto = <T,>(v: T | null, d: T | undefined) => (v ?? d) as T
  const pushIf = (cond: boolean, text: string) => cond && changes.push(text)

  pushIf(
    current.lead_time_days !== base.lead_time_days,
    `Lead time ${num0(auto(base.lead_time_days, derived?.lead_time_days))} → ${num0(auto(current.lead_time_days, derived?.lead_time_days))} d`,
  )
  pushIf(
    current.late_share !== base.late_share,
    `Tardías ${pct(auto(base.late_share, derived?.late_share))} → ${pct(auto(current.late_share, derived?.late_share))}`,
  )
  pushIf(current.demand_multiplier !== base.demand_multiplier, `Demanda ${signedPct(current.demand_multiplier - 1)}`)
  pushIf(current.demand_window_months !== base.demand_window_months, `Historia ${current.demand_window_months} meses`)
  pushIf(
    current.demand_in_stock_months_only !== base.demand_in_stock_months_only,
    current.demand_in_stock_months_only ? 'Demanda: promedio de meses con stock' : 'Demanda: leads + sustituciones',
  )
  pushIf(
    current.substitution_in_gap !== base.substitution_in_gap,
    current.substitution_in_gap ? 'Con sustitución en el hueco' : 'Sin sustitución en el hueco',
  )
  pushIf(
    current.learned_correction !== base.learned_correction,
    current.learned_correction ? 'Corrección aprendida' : 'Sin corrección aprendida',
  )
  pushIf(
    current.safety_months !== base.safety_months,
    current.safety_months === 'gap_plus_horizon' ? 'Seguridad sobre hueco + horizonte' : 'Seguridad solo sobre el horizonte',
  )
  pushIf(
    current.safety_sigma !== base.safety_sigma,
    current.safety_sigma === 'deseasonalized' ? 'Variabilidad sin estacionalidad' : 'Variabilidad con estacionalidad',
  )
  pushIf(current.leftover_extra_months !== base.leftover_extra_months, `Sobrante ${months(current.leftover_extra_months)} en patio`)
  pushIf(current.leftover_discount !== base.leftover_discount, `Descuento del sobrante ${pct(current.leftover_discount)}`)
  pushIf(current.late_delay_months !== base.late_delay_months, `Retraso tardías ${months(current.late_delay_months)}`)
  pushIf(stableStringify(current.end_of_life) !== stableStringify(base.end_of_life), 'Fin de generación')
  for (const [model, o] of Object.entries(current.overrides)) {
    const parts = []
    if (o.forced_order != null) parts.push(`cantidad fijada en ${o.forced_order}`)
    if (o.manual_adjustment) parts.push(`ajuste ${o.manual_adjustment > 0 ? '+' : ''}${o.manual_adjustment}`)
    if (o.rule) parts.push(`regla ${o.rule.min_order}/${o.rule.lot_multiple}`)
    changes.push(`${model}: ${parts.join(', ')}`)
  }
  return changes
}
