// Estado de los supuestos del Caso 2: `base` son los valores por defecto (los del notebook) y `current` lo que
// se ajustó en pantalla. Se envían tal cual a /api/renewals/simulate y /queue.
import { num0, pct } from '@/lib/format'
import type { Parameters } from '../types'

export interface RenewalParametersState {
  version: string | null
  base: Parameters | null
  current: Parameters | null
}

export type RenewalParametersAction =
  | { type: 'load'; version: string; base: Parameters; saved?: Parameters | null }
  | { type: 'set'; field: keyof Parameters; value: Parameters[keyof Parameters] }
  | { type: 'resetFields'; fields: (keyof Parameters)[] }
  | { type: 'replace'; parameters: Parameters }
  | { type: 'reset' }

export const initialState: RenewalParametersState = { version: null, base: null, current: null }

export function renewalParametersReducer(state: RenewalParametersState, action: RenewalParametersAction): RenewalParametersState {
  if (action.type === 'load') {
    const kept = state.current ?? action.saved
    return { version: action.version, base: action.base, current: kept ? { ...action.base, ...kept } : action.base }
  }
  const { base, current } = state
  if (!base || !current) return state
  switch (action.type) {
    case 'set': {
      const next = { ...current, [action.field]: action.value }
      // La fecha límite siempre va después de la apertura
      if (next.deadline_days >= next.open_days) {
        if (action.field === 'open_days') next.deadline_days = Math.max(0, next.open_days - 1)
        else next.open_days = Math.min(30, next.deadline_days + 1)
      }
      return { ...state, current: next }
    }
    case 'resetFields': {
      const next = { ...current } as Record<keyof Parameters, unknown>
      for (const f of action.fields) next[f] = base[f]
      return { ...state, current: next as unknown as Parameters }
    }
    case 'replace':
      return { ...state, current: { ...base, ...action.parameters } }
    case 'reset':
      return { ...state, current: base }
  }
}

export const SECTION_FIELDS = {
  window: ['open_days', 'deadline_days', 'grace_days'],
  capacity: ['daily_capacity', 'agents'],
  impact: ['target_window_share', 'automatic_channel_rate'],
} as const satisfies Record<string, readonly (keyof Parameters)[]>

export function sectionChanged(base: Parameters, current: Parameters, fields: readonly (keyof Parameters)[]): boolean {
  return fields.some((f) => base[f] !== current[f])
}

export function sameParameters(a: Parameters, b: Parameters): boolean {
  return (Object.keys(a) as (keyof Parameters)[]).every((k) => a[k] === b[k])
}

// Etiquetas legibles de lo que cambió respecto de los valores por defecto
export function describeChanges(base: Parameters, current: Parameters, observedAutomaticRate: number | null): string[] {
  const changes: string[] = []
  const pushIf = (cond: boolean, text: string) => cond && changes.push(text)
  pushIf(current.open_days !== base.open_days, `Apertura ${base.open_days} → ${current.open_days} d`)
  pushIf(current.deadline_days !== base.deadline_days, `Fecha límite ${base.deadline_days} → ${current.deadline_days} d`)
  pushIf(current.grace_days !== base.grace_days, `Gracia ${base.grace_days} → ${current.grace_days} d`)
  pushIf(current.daily_capacity !== base.daily_capacity, `Capacidad ${num0(base.daily_capacity)} → ${num0(current.daily_capacity)} llamadas/día`)
  pushIf(current.agents !== base.agents, `Gestores ${base.agents} → ${current.agents}`)
  pushIf(current.target_window_share !== base.target_window_share, `Meta en ventana ${pct(current.target_window_share)}`)
  pushIf(
    current.automatic_channel_rate !== base.automatic_channel_rate,
    current.automatic_channel_rate === null
      ? 'Canal automático: tasa observada'
      : `Canal automático al ${pct(current.automatic_channel_rate)}${observedAutomaticRate != null ? ` (observado ${pct(observedAutomaticRate)})` : ''}`,
  )
  return changes
}
