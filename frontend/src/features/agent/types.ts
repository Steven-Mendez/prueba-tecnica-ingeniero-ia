// Tipos espejo de app/schemas/agent.py (asistente sobre el planificador o sobre la cola de renovaciones).
import type { Parameters } from '@/features/factory-order/types'
import type { Parameters as RenewalParameters } from '@/features/renewals/types'

export type Reasoning = 'low' | 'medium' | 'high'
export type AgentCase = 'factory_order' | 'renewals'

export interface AgentStatus {
  enabled: boolean
  provider: 'openai' | 'anthropic' | null
  model: string | null
  models: string[]
  reasoning: Reasoning
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ModelChoice {
  model: string | null
  reasoning: Reasoning | null
}

// Lo que el asistente sabe de la pantalla: el caso y, según el caso, los supuestos (y el día y gestor de la cola)
export interface ChatContext {
  case: AgentCase
  parameters: Parameters | null
  renewal_parameters: RenewalParameters | null
  day: string | null
  agent: string | null
}

export interface ChatRequest extends ModelChoice, ChatContext {
  thread_id: string
  messages: ChatMessage[]
}

export interface Decision {
  type: 'approve' | 'reject' | 'edit' | 'respond'
  message?: string
}

export interface ResumeRequest extends ModelChoice, ChatContext {
  thread_id: string
  decisions: Decision[]
}

// Una acción que el agente quiere ejecutar y espera aprobación (human in the loop)
export interface ActionRequest {
  name: string
  args: Record<string, unknown>
  description: string
}

// Eventos del stream SSE, en el orden en que llegan
export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; ok: boolean }
  | { type: 'action'; action: 'set_parameters'; parameters: Parameters }
  | { type: 'action'; action: 'navigate'; path: string }
  | { type: 'action'; action: 'download_csv'; table: 'model' | 'version' }
  | { type: 'action'; action: 'plans_changed'; plan_id: string | null; plan_name: string | null }
  | { type: 'action'; action: 'set_renewal_parameters'; renewal_parameters: RenewalParameters }
  | { type: 'action'; action: 'set_day'; day: string }
  | { type: 'action'; action: 'contact_logged'; contact_id: string | null; policy: string | null; agent: string | null }
  | { type: 'action'; action: 'download_queue_csv'; day: string | null; pending_only: boolean | null }
  | { type: 'interrupt'; requests: ActionRequest[] }
  | AgentChart
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface AgentChart {
  type: 'chart'
  title: string
  kind: 'bar' | 'line'
  x_key: string
  series: { key: string; label: string }[]
  data: Record<string, string | number | null>[]
}

// Una llamada a herramienta tal como se muestra en el chat
export interface ToolStep {
  name: string
  args?: Record<string, unknown>
  ok: boolean | null
}

// Aprobación pendiente o ya decidida dentro de un turno
export interface Approval {
  requests: ActionRequest[]
  decision: 'approve' | 'reject' | null
}

// Un turno de la conversación en pantalla. El asistente puede traer texto, pasos, gráficos, acciones y una
// aprobación pendiente.
export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  steps: ToolStep[]
  charts: AgentChart[]
  actions: string[]
  approval: Approval | null
  error: string | null
  pending: boolean
}
