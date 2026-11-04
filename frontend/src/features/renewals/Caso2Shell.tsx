import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type Dispatch } from 'react'
import { toast } from 'sonner'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebouncedRequest } from '@/hooks/useDebouncedRequest'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'
import { fetchRenewalsSheet, fetchRenewalsStatus, simulateRenewals } from '@/lib/api'
import { AgentPanel } from '@/features/agent/AgentPanel'
import { agent } from '@/features/agent/agentStore'
import { AppSidebar } from '@/features/app/AppSidebar'
import { continueTour, registerTour, tourFinished } from '@/features/app/tour'
import { caso2Tour } from '@/features/app/tourCaso2'
import { useSourceStatus } from '@/features/app/useSourceStatus'
import type { RenewalsDataStatus } from '@/features/data/types'
import { describeChanges, type RenewalParametersAction } from './parameters/state'
import { useRenewalParameters } from './parameters/useRenewalParameters'
import type { ParameterDefaults, Parameters, SimulationResult } from './types'

const RenewalsHome = lazy(() => import('./home/RenewalsHome'))
const QueuePage = lazy(() => import('./queue/QueuePage'))
const DashboardPage = lazy(() => import('./dashboard/DashboardPage'))
const AssumptionsPage = lazy(() => import('./assumptions/AssumptionsPage'))
const DataPage = lazy(() => import('@/features/data/DataPage'))
const ChatPage = lazy(() => import('@/features/agent/ChatPage'))

registerTour('caso2', caso2Tour)

const DAY_KEY = 'renewals:day'
const AGENT_KEY = 'renewals:agent'

// Todo lo que las pantallas del Caso 2 comparten: fuente, supuestos, simulación, día y gestor elegidos
export interface RenewalsCtx {
  status: RenewalsDataStatus | null
  version: string | null
  params: {
    defaults: ParameterDefaults | null
    base: Parameters | null
    current: Parameters | null
    dirty: boolean
    dispatch: Dispatch<RenewalParametersAction>
    error: string | null
    retry: () => void
  }
  sim: { result: SimulationResult | null; recalculating: boolean; error: string | null; retry: () => void }
  changes: string[]
  day: string | null
  setDay: (iso: string) => void
  agent: string | null
  setAgent: (code: string | null) => void
  // Cambia cuando se registra un resultado (desde la pantalla o desde el asistente): las colas se recargan
  contactsVersion: number
  bumpContacts: () => void
}

function PageLoading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

// Caso 2 · cola de renovaciones
export default function Caso2Shell({ section, sub }: { section: string; sub: string | null }) {
  const data = useSourceStatus(fetchRenewalsStatus)
  const params = useRenewalParameters(data.version)
  const sim = useDebouncedRequest<Parameters, SimulationResult>(data.version, params.current, simulateRenewals)
  const derived = sim.result?.derived ?? params.defaults?.derived ?? null

  const [day, setDayState] = useState<string | null>(() => readStorage<string>(DAY_KEY))
  const [agentFilter, setAgentState] = useState<string | null>(() => readStorage<string>(AGENT_KEY))
  const [contactsVersion, setContactsVersion] = useState(0)
  const effectiveDay = day ?? derived?.default_day ?? null

  const setDay = useCallback((iso: string) => {
    setDayState(iso)
    writeStorage(DAY_KEY, iso)
  }, [])
  const setAgent = useCallback((code: string | null) => {
    setAgentState(code)
    writeStorage(AGENT_KEY, code)
  }, [])
  const bumpContacts = useCallback(() => setContactsVersion((n) => n + 1), [])

  // Recorrido guiado: retoma el capítulo pendiente al entrar en su sección y confirma al registrar el resultado final
  useEffect(() => {
    continueTour(section)
  }, [section])
  useEffect(() => {
    if (contactsVersion > 0 && tourFinished('caso2')) {
      toast.success('¡Resultado registrado! Recorrido completo.', {
        description: 'La póliza salió de las pendientes y cuenta en los indicadores del día y del panel del jefe.',
        duration: 10000,
        action: { label: 'Ver panel', onClick: () => (window.location.hash = '/caso2/panel') },
      })
    }
  }, [contactsVersion])

  const { base, current, dispatch } = params
  const changes = useMemo(
    () => (base && current ? describeChanges(base, current, derived?.observed_automatic_rate ?? null) : []),
    [base, current, derived],
  )

  // El asistente lee los supuestos, el día y el gestor en pantalla y puede cambiarlos
  useEffect(() => {
    agent.link({ case: 'caso2', parameters: current, day: effectiveDay, agent: agentFilter, dispatch, setDay, onContactLogged: bumpContacts })
  }, [current, effectiveDay, agentFilter, dispatch, setDay, bumpContacts])

  const ctx: RenewalsCtx = {
    status: data.status,
    version: data.version,
    params,
    sim,
    changes,
    day: effectiveDay,
    setDay,
    agent: agentFilter,
    setAgent,
    contactsVersion,
    bumpContacts,
  }

  return (
    <SidebarProvider>
      <AppSidebar caseId="caso2" section={section} sub={sub} sheets={data.status?.sheets} />
      <SidebarInset className="min-w-0">
        <Suspense fallback={<PageLoading />}>
          {section === 'inicio' ? (
            <RenewalsHome ctx={ctx} error={data.error} onRetry={data.reload} />
          ) : section === 'cola' ? (
            <QueuePage ctx={ctx} />
          ) : section === 'panel' ? (
            <DashboardPage ctx={ctx} />
          ) : section === 'datos' ? (
            <DataPage sheet={sub} status={data.status} version={data.version} fetchSheet={fetchRenewalsSheet} />
          ) : section === 'asistente' ? (
            <ChatPage />
          ) : (
            <AssumptionsPage ctx={ctx} />
          )}
        </Suspense>
      </SidebarInset>
      <AgentPanel hidden={section === 'asistente'} />
    </SidebarProvider>
  )
}
