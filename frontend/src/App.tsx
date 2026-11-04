import { lazy, Suspense, useEffect } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { useHashRoute } from '@/hooks/useHashRoute'
import { agent } from '@/features/agent/agentStore'

// Cada prototipo se descarga al abrirlo
const LandingPage = lazy(() => import('@/features/landing/LandingPage'))
const Caso1Shell = lazy(() => import('@/features/app/Caso1Shell'))
const Caso2Shell = lazy(() => import('@/features/renewals/Caso2Shell'))

function PageLoading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

// Raíz: la bienvenida elige el prototipo; cada caso tiene su propio shell (sidebar, estado y asistente)
export default function App() {
  const route = useHashRoute()

  // Enlaces antiguos del Caso 1 (#/planificador, #/pedido…) → #/caso1/…
  useEffect(() => {
    if (route.legacyRedirect) window.location.replace(`#/${route.legacyRedirect}`)
  }, [route.legacyRedirect])

  // El estado del proveedor del asistente se consulta una vez para toda la app
  useEffect(() => {
    const ctrl = new AbortController()
    void agent.loadStatus(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  return (
    <Suspense fallback={<PageLoading />}>
      {route.caseId === null ? (
        <LandingPage />
      ) : route.caseId === 'caso1' ? (
        <Caso1Shell section={route.section} sub={route.sub} />
      ) : (
        <Caso2Shell section={route.section} sub={route.sub} />
      )}
    </Suspense>
  )
}
