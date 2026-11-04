import { lazy, Suspense, useEffect, useMemo } from 'react'
import { toast } from 'sonner'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { navigate } from '@/hooks/useHashRoute'
import { AgentPanel } from '@/features/agent/AgentPanel'
import { agent } from '@/features/agent/agentStore'
import { AppSidebar } from '@/features/app/AppSidebar'
import { continueTour, registerTour, tourFinished } from '@/features/app/tour'
import { caso1Tour } from '@/features/app/tourCaso1'
import { useDataStatus } from '@/features/app/useDataStatus'
import { useCalculation } from '@/features/factory-order/calculation/useCalculation'
import { PlannerPage } from '@/features/factory-order/PlannerPage'
import { PLANNER_TABS } from '@/features/factory-order/plannerTabs'
import { describeChanges } from '@/features/factory-order/parameters/state'
import { useParameters } from '@/features/factory-order/parameters/useParameters'
import type { Parameters } from '@/features/factory-order/types'

// Secciones que solo se descargan al abrirlas (cada una trae sus gráficos)
const SalesPage = lazy(() => import('@/features/sales/SalesPage'))
const DataPage = lazy(() => import('@/features/data/DataPage'))
const TrackingPage = lazy(() => import('@/features/tracking/TrackingPage'))
const HomePage = lazy(() => import('@/features/home/HomePage'))
const ChatPage = lazy(() => import('@/features/agent/ChatPage'))

function PageLoading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

registerTour('caso1', caso1Tour)

// Caso 1 · planificador de pedidos a fábrica: el estado del caso (fuente, supuestos, cálculo) vive aquí
export default function Caso1Shell({ section, sub: routeSub }: { section: string; sub: string | null }) {
  // La versión de la fuente es la clave de todo lo que se pide a la API
  const data = useDataStatus()
  const params = useParameters(data.version)
  const calc = useCalculation(data.version, params.current)

  const derived = calc.result?.derived ?? params.defaults?.derived ?? null
  const { base, current } = params
  const changes = useMemo(() => (base && current ? describeChanges(base, current, derived) : []), [base, current, derived])

  // #/caso1/pedido (una pestaña del planificador como sección) abre esa pestaña
  let sub = routeSub
  if (PLANNER_TABS.some((t) => t.value === section)) {
    sub = section
    section = 'planificador'
  }

  // El asistente lee los supuestos en pantalla y puede cambiarlos
  const { dispatch: dispatchParams } = params
  useEffect(() => {
    agent.link({ case: 'caso1', parameters: current, dispatch: dispatchParams })
  }, [current, dispatchParams])

  // Recorrido guiado: retoma el capítulo pendiente al entrar en su sección y confirma al guardar el pedido final
  useEffect(() => {
    continueTour(section)
  }, [section])
  const savedForWindow = calc.result?.window_plans.length ?? 0
  useEffect(() => {
    if (savedForWindow > 0 && tourFinished('caso1')) {
      toast.success('¡Pedido creado! Recorrido completo.', {
        description: 'Queda en Seguimiento, en Pedidos guardados, y contará como tránsito al planificar la ventana siguiente.',
        duration: 10000,
        action: { label: 'Ver', onClick: () => navigate('seguimiento') },
      })
    }
  }, [savedForWindow])

  const openPlan = (parameters: Parameters) => {
    params.dispatch({ type: 'replace', parameters })
    navigate('planificador/pedido')
    toast.info('Plan abierto en el planificador', { description: 'Se calcula con la versión actual de los datos.' })
  }

  const applyCorrection = () => {
    params.dispatch({ type: 'set', field: 'learned_correction', value: true })
    navigate('planificador/pedido')
  }

  return (
    <SidebarProvider>
      <AppSidebar caseId="caso1" section={section} sub={sub} sheets={data.status?.sheets} />
      {/* min-w-0: sin esto, una tabla ancha ensancha todo el inset en vez de desplazarse dentro de su tarjeta */}
      <SidebarInset className="min-w-0">
        <Suspense fallback={<PageLoading />}>
          {section === 'inicio' ? (
            <HomePage status={data.status} />
          ) : section === 'ventas' ? (
            <SalesPage version={data.version} />
          ) : section === 'datos' ? (
            <DataPage sheet={sub} status={data.status} version={data.version} />
          ) : section === 'asistente' ? (
            <ChatPage />
          ) : section === 'seguimiento' ? (
            <TrackingPage version={data.version} onOpenPlan={openPlan} onApplyCorrection={applyCorrection} />
          ) : (
            <PlannerPage tab={sub} params={params} calc={calc} changes={changes} />
          )}
        </Suspense>
      </SidebarInset>
      <AgentPanel hidden={section === 'asistente'} />
    </SidebarProvider>
  )
}
