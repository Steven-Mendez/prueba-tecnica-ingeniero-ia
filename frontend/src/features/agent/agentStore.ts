import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { downloadCsv, fetchAgentStatus, forgetAgentThread, resumeAgentChat, streamAgentChat } from '@/lib/api'
import { navigate } from '@/hooks/useHashRoute'
import type { ParametersAction } from '@/features/factory-order/parameters/state'
import type { Parameters } from '@/features/factory-order/types'
import type { AgentEvent, AgentStatus, ChatTurn, Decision, Reasoning } from './types'

// Estado del asistente, compartido entre el panel lateral y la pantalla de chat. Es una demo: la conversación
// vive solo en memoria mientras el chat está abierto (pantalla o panel); al salir se pierde y el servidor olvida
// el hilo. Sin librería de estado: un store externo de React.
interface AgentState {
  open: boolean
  status: AgentStatus | null
  threadId: string
  turns: ChatTurn[]
  busy: boolean
  model: string | null
  reasoning: Reasoning
}

let nextId = 0
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}-${(nextId++).toString(36)}`

let state: AgentState = {
  open: false,
  status: null,
  threadId: newId('c'),
  turns: [],
  busy: false,
  model: null,
  reasoning: 'medium',
}
const listeners = new Set<() => void>()

function set(patch: Partial<AgentState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAgentState(): AgentState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

const emptyTurn = (role: ChatTurn['role'], text = ''): ChatTurn => ({
  id: newId('t'),
  role,
  text,
  steps: [],
  charts: [],
  actions: [],
  approval: null,
  error: null,
  pending: role === 'assistant',
})

function patchLast(fn: (turn: ChatTurn) => ChatTurn) {
  const { turns } = state
  if (!turns.length) return
  set({ turns: [...turns.slice(0, -1), fn(turns[turns.length - 1])] })
}

// Lo que el planificador tiene en pantalla y cómo cambiarlo; lo fija App en cada render
export interface PlannerLink {
  parameters: Parameters | null
  dispatch: (action: ParametersAction) => void
}
let planner: PlannerLink = { parameters: null, dispatch: () => {} }

const onChatPage = () => window.location.hash.replace(/^#\/?/, '').startsWith('asistente')

function apply(event: AgentEvent) {
  switch (event.type) {
    case 'text':
      patchLast((t) => ({ ...t, text: t.text + event.delta }))
      break
    case 'tool_call':
      patchLast((t) => ({ ...t, steps: [...t.steps, { name: event.name, args: event.args, ok: null }] }))
      break
    case 'tool_result':
      patchLast((t) => {
        const steps = [...t.steps]
        const i = steps.findIndex((s) => s.name === event.name && s.ok === null)
        if (i >= 0) steps[i] = { ...steps[i], ok: event.ok }
        return { ...t, steps }
      })
      break
    case 'action':
      if (event.action === 'set_parameters') {
        planner.dispatch({ type: 'replace', parameters: event.parameters })
        patchLast((t) => ({ ...t, actions: [...t.actions, 'Cambió los supuestos en pantalla'] }))
        toast.info('El asistente cambió los supuestos', {
          description: 'El pedido se recalculó en el planificador.',
          action: { label: 'Ver', onClick: () => agent.goTo('planificador/pedido') },
        })
      } else if (event.action === 'navigate') {
        agent.goTo(event.path)
        patchLast((t) => ({ ...t, actions: [...t.actions, `Abrió ${event.path.replace('/', ' › ')}`] }))
      } else if (event.action === 'download_csv') {
        patchLast((t) => ({ ...t, actions: [...t.actions, `Descargó el CSV por ${event.table === 'model' ? 'modelo' : 'versión'}`] }))
        if (planner.parameters) {
          void downloadCsv(event.table, planner.parameters).then(
            (name) => toast.success(`Descargado ${name}`),
            (e: unknown) => toast.error('No se pudo descargar el CSV', { description: e instanceof Error ? e.message : String(e) }),
          )
        }
      } else if (event.action === 'plans_changed') {
        patchLast((t) => ({ ...t, actions: [...t.actions, event.plan_name ? `Plan: ${event.plan_name}` : 'Planes actualizados'] }))
        toast.success('Planes guardados actualizados', {
          description: event.plan_name ?? undefined,
          action: { label: 'Ver', onClick: () => agent.goTo('seguimiento') },
        })
      }
      break
    case 'interrupt':
      patchLast((t) => ({ ...t, approval: { requests: event.requests, decision: null }, pending: false }))
      break
    case 'chart':
      patchLast((t) => ({ ...t, charts: [...t.charts, event] }))
      break
    case 'error':
      patchLast((t) => ({ ...t, error: event.message }))
      break
    case 'done':
      break
  }
}

let abort: AbortController | null = null

async function run(request: (signal: AbortSignal) => Promise<void>) {
  set({ busy: true })
  abort = new AbortController()
  const ctrl = abort
  const threadId = state.threadId
  try {
    await request(ctrl.signal)
  } catch (e: unknown) {
    if (!ctrl.signal.aborted && state.threadId === threadId) {
      patchLast((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }))
    }
  } finally {
    if (state.threadId === threadId) {
      patchLast((t) => ({ ...t, pending: false }))
      set({ busy: false })
    }
    if (abort === ctrl) abort = null
  }
}

export const agent = {
  open: () => set({ open: true }),
  // Cerrar el panel termina la conversación (demo sin persistencia)
  close: () => {
    set({ open: false })
    if (!onChatPage()) agent.reset()
  },
  toggle: () => (state.open ? agent.close() : agent.open()),
  // Navegación pedida por el agente desde la pantalla de chat: la conversación sigue en el panel lateral
  goTo: (path: string) => {
    if (onChatPage()) set({ open: true })
    navigate(path)
  },
  // Al salir de la pantalla de chat por decisión del usuario (panel cerrado) la conversación se pierde
  leaveChatPage: () => {
    if (!state.open) agent.reset()
  },
  link: (next: PlannerLink) => {
    planner = next
  },
  setModel: (model: string | null) => set({ model }),
  setReasoning: (reasoning: Reasoning) => set({ reasoning }),
  loadStatus: async (signal?: AbortSignal) => {
    try {
      const status = await fetchAgentStatus(signal)
      set({ status, model: status.model, reasoning: status.reasoning })
    } catch {
      if (!signal?.aborted) set({ status: { enabled: false, provider: null, model: null, models: [], reasoning: 'medium' } })
    }
  },
  reset: () => {
    abort?.abort()
    if (state.turns.length) void forgetAgentThread(state.threadId)
    set({ threadId: newId('c'), turns: [], busy: false })
  },
  send: (content: string) => {
    const text = content.trim()
    if (!text || state.busy) return
    const history = [...state.turns, emptyTurn('user', text)]
    set({ turns: [...history, emptyTurn('assistant')] })
    const threadId = state.threadId
    return run((signal) =>
      streamAgentChat(
        {
          thread_id: threadId,
          model: state.model,
          reasoning: state.reasoning,
          messages: history.filter((t) => t.text.trim()).map((t) => ({ role: t.role, content: t.text })),
          parameters: planner.parameters,
        },
        (event) => {
          if (state.threadId === threadId) apply(event)
        },
        signal,
      ),
    )
  },
  // Decisión sobre las acciones pendientes del último turno (todas con la misma decisión, en orden)
  decide: (decision: 'approve' | 'reject', message?: string) => {
    const last = state.turns[state.turns.length - 1]
    if (!last?.approval || last.approval.decision || state.busy) return
    const decisions: Decision[] = last.approval.requests.map(() => ({ type: decision, ...(message ? { message } : {}) }))
    patchLast((t) => ({ ...t, approval: t.approval && { ...t.approval, decision }, pending: true }))
    const threadId = state.threadId
    return run((signal) =>
      resumeAgentChat(
        { thread_id: threadId, model: state.model, reasoning: state.reasoning, decisions, parameters: planner.parameters },
        (event) => {
          if (state.threadId === threadId) apply(event)
        },
        signal,
      ),
    )
  },
  stop: () => abort?.abort(),
}
