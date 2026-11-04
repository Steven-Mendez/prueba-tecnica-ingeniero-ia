// Cliente de la API. Rutas relativas: en desarrollo las atiende el proxy de Vite y en producción el mismo FastAPI.
// La app solo lee la fuente de datos (en el prototipo, el Excel del caso); no sube archivos.
import type { AgentEvent, AgentStatus, ChatRequest, ResumeRequest } from '@/features/agent/types'
import type { DataStatus, RenewalsDataStatus, SheetPage, SheetQuery } from '@/features/data/types'
import type {
  Accuracy,
  CalculationResult,
  ParameterDefaults,
  Parameters,
  Plan,
  PlanStatus,
} from '@/features/factory-order/types'
import type {
  Contact,
  ContactCreate,
  DailyQueue,
  DayOverview,
  NotebookQueue,
  ParameterDefaults as RenewalParameterDefaults,
  Parameters as RenewalParameters,
  PolicyDetail,
  SimulationResult,
} from '@/features/renewals/types'
import type { SalesOverview, SalesQuery } from '@/features/sales/types'

// FastAPI devuelve `detail` como texto (errores propios) o como lista de errores de validación (422)
function errorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
        .filter(Boolean)
        .join(' · ')
    }
  }
  return fallback
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init.headers } })
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // respuesta sin JSON: se queda el status
    }
    throw new Error(errorDetail(body, `${res.status} ${res.statusText}`))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function sendJson<T>(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    signal,
  })
}

function query(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '' || value === false) continue
    if (Array.isArray(value)) value.forEach((v) => q.append(key, v))
    else q.set(key, String(value))
  }
  const text = q.toString()
  return text ? `?${text}` : ''
}

// Fuente de datos ---------------------------------------------------------------------------------------------

export const fetchDataStatus = (signal?: AbortSignal) => request<DataStatus>('/api/data/status', { signal })

const sheetQuery = (q: SheetQuery) =>
  query({
    page: q.page,
    page_size: q.page_size,
    q: q.q,
    model: q.model,
    date_from: q.date_from,
    date_to: q.date_to,
    flag: q.flag,
    sort: q.sort,
    desc: q.desc,
  })

export const fetchSheet = (key: string, q: SheetQuery, signal?: AbortSignal) =>
  request<SheetPage>(`/api/data/sheets/${key}${sheetQuery(q)}`, { signal })

// Ventas ------------------------------------------------------------------------------------------------------

export const fetchSales = (q: SalesQuery, signal?: AbortSignal) =>
  request<SalesOverview>(`/api/sales/overview${query({ ...q })}`, { signal })

// Planificador ------------------------------------------------------------------------------------------------

const PLANNER = '/api/factory-order'

export const fetchParameterDefaults = (signal?: AbortSignal) =>
  request<ParameterDefaults>(`${PLANNER}/parameters`, { signal })

export const calculateOrder = (parameters: Parameters | string, signal?: AbortSignal) =>
  sendJson<CalculationResult>('POST', `${PLANNER}/calculate`, parameters, signal)

export const fetchAccuracy = (signal?: AbortSignal) => request<Accuracy>(`${PLANNER}/accuracy`, { signal })

export const fetchPlans = (signal?: AbortSignal) => request<Plan[]>(`${PLANNER}/plans`, { signal })

export const createPlan = (name: string, note: string, parameters: Parameters) =>
  sendJson<Plan>('POST', `${PLANNER}/plans`, { name, note, parameters })

export const updatePlan = (id: string, patch: { name?: string; note?: string; status?: PlanStatus }) =>
  sendJson<Plan>('PATCH', `${PLANNER}/plans/${id}`, patch)

export const deletePlan = (id: string) => request<void>(`${PLANNER}/plans/${id}`, { method: 'DELETE' })

// Descarga un archivo calculado con un cuerpo JSON; el nombre sale de Content-Disposition
async function downloadFile(path: string, body: unknown, fallbackName: string) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      // sin JSON
    }
    throw new Error(errorDetail(payload, `${res.status} ${res.statusText}`))
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}

// Descarga un CSV del pedido calculado con los parámetros actuales
export const downloadCsv = (table: 'model' | 'version', parameters: Parameters) =>
  downloadFile(`${PLANNER}/export/${table}`, parameters, `pedido_${table}.csv`)

// Caso 2 · Renovaciones ---------------------------------------------------------------------------------------

const RENEWALS = '/api/renewals'

export const fetchRenewalsStatus = (signal?: AbortSignal) =>
  request<RenewalsDataStatus>(`${RENEWALS}/data/status`, { signal })

export const fetchRenewalsSheet = (key: string, q: SheetQuery, signal?: AbortSignal) =>
  request<SheetPage>(`${RENEWALS}/data/sheets/${key}${sheetQuery(q)}`, { signal })

export const fetchRenewalDefaults = (signal?: AbortSignal) =>
  request<RenewalParameterDefaults>(`${RENEWALS}/parameters`, { signal })

export const simulateRenewals = (parameters: RenewalParameters | string, signal?: AbortSignal) =>
  sendJson<SimulationResult>('POST', `${RENEWALS}/simulate`, parameters, signal)

export const fetchDayOverview = (parameters: RenewalParameters, day: string, signal?: AbortSignal) =>
  sendJson<DayOverview>('POST', `${RENEWALS}/day${query({ day })}`, parameters, signal)

export const fetchDailyQueue = (parameters: RenewalParameters, day: string, agent: string | null, signal?: AbortSignal) =>
  sendJson<DailyQueue>('POST', `${RENEWALS}/queue${query({ day, agent })}`, parameters, signal)

export const fetchPolicy = (policy: string, parameters: RenewalParameters, day: string, signal?: AbortSignal) =>
  sendJson<PolicyDetail>('POST', `${RENEWALS}/policies/${encodeURIComponent(policy)}${query({ day })}`, parameters, signal)

export const fetchContacts = (q: { day?: string; agent?: string; policy?: string }, signal?: AbortSignal) =>
  request<Contact[]>(`${RENEWALS}/contacts${query(q)}`, { signal })

export const createContact = (body: ContactCreate) => sendJson<Contact>('POST', `${RENEWALS}/contacts`, body)

export const deleteContact = (id: string) => request<void>(`${RENEWALS}/contacts/${id}`, { method: 'DELETE' })

export const fetchNotebookQueue = (signal?: AbortSignal) => request<NotebookQueue>(`${RENEWALS}/notebook-queue`, { signal })

export const downloadQueueCsv = (parameters: RenewalParameters, day: string, pendingOnly = false) =>
  downloadFile(`${RENEWALS}/queue/export${query({ day, pending_only: pendingOnly })}`, parameters, `cola_renovaciones_${day}.csv`)

// Asistente ---------------------------------------------------------------------------------------------------

export const fetchAgentStatus = (signal?: AbortSignal) => request<AgentStatus>('/api/agent/status', { signal })

export const forgetAgentThread = (threadId: string) =>
  fetch(`/api/agent/threads/${threadId}`, { method: 'DELETE', keepalive: true }).catch(() => undefined)

// Una vuelta del chat en streaming (SSE): cada línea `data:` es un evento. Resuelve cuando llega `done`.
export const streamAgentChat = (body: ChatRequest, onEvent: (event: AgentEvent) => void, signal?: AbortSignal) =>
  streamAgent('/api/agent/chat', body, onEvent, signal)

// Continúa tras una aprobación (human in the loop)
export const resumeAgentChat = (body: ResumeRequest, onEvent: (event: AgentEvent) => void, signal?: AbortSignal) =>
  streamAgent('/api/agent/resume', body, onEvent, signal)

async function streamAgent(path: string, body: unknown, onEvent: (event: AgentEvent) => void, signal?: AbortSignal) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      // sin JSON
    }
    throw new Error(errorDetail(payload, `${res.status} ${res.statusText}`))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let cut = buffer.indexOf('\n\n')
    while (cut >= 0) {
      const frame = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)) as AgentEvent)
      }
      cut = buffer.indexOf('\n\n')
    }
  }
}
