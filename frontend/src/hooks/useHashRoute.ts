import { useSyncExternalStore } from 'react'

import { PLANNER_TABS } from '@/features/factory-order/plannerTabs'

// Enrutado mínimo por hash: la app es una sola página servida por FastAPI y no necesita más.
//   #/                      → bienvenida: elegir prototipo
//   #/caso1/seccion/sub     → Caso 1 (pedido a fábrica)
//   #/caso2/seccion/sub     → Caso 2 (cola de renovaciones)
// Los enlaces antiguos del Caso 1 (#/planificador, #/seguimiento, #/pedido…) redirigen a #/caso1/….
export type CaseId = 'caso1' | 'caso2'
export const CASES: readonly CaseId[] = ['caso1', 'caso2']

const LEGACY_CASO1 = new Set(['inicio', 'planificador', 'seguimiento', 'ventas', 'datos', 'asistente'])

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const isCase = (x: string | undefined): x is CaseId => x === 'caso1' || x === 'caso2'

function parts(hash = window.location.hash): string[] {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

// El caso en pantalla (Caso 1 si la ruta no dice otra cosa)
export function currentCase(): CaseId {
  const head = parts()[0]
  return isCase(head) ? head : 'caso1'
}

// Navega dentro del caso actual salvo que la ruta ya traiga el caso (o sea la raíz)
export function navigate(path: string) {
  let clean = path.replace(/^\/+/, '')
  if (clean && !isCase(clean.split('/')[0])) clean = `${currentCase()}/${clean}`
  window.location.hash = `/${clean}`
}

export interface Route {
  caseId: CaseId | null // null = bienvenida
  section: string
  sub: string | null
  legacyRedirect: string | null // ruta antigua del Caso 1 que hay que reescribir
  navigate: typeof navigate
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  const p = parts(hash)
  const head = p[0]
  if (!head) return { caseId: null, section: '', sub: null, legacyRedirect: null, navigate }
  if (isCase(head)) return { caseId: head, section: p[1] ?? 'inicio', sub: p[2] ?? null, legacyRedirect: null, navigate }
  if (LEGACY_CASO1.has(head)) return { caseId: 'caso1', section: head, sub: p[1] ?? null, legacyRedirect: `caso1/${p.join('/')}`, navigate }
  if (PLANNER_TABS.some((t) => t.value === head)) {
    return { caseId: 'caso1', section: 'planificador', sub: head, legacyRedirect: `caso1/planificador/${head}`, navigate }
  }
  return { caseId: null, section: '', sub: null, legacyRedirect: null, navigate }
}
