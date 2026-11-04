import { AlertCircle, Info, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type Dispatch, type ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { date, num0, num1 } from '@/lib/format'
import { navigate } from '@/hooks/useHashRoute'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Help } from '@/components/Term'
import { G } from '@/lib/glossary'
import { PageHeader } from '@/features/app/PageHeader'
import { OrderSteps } from './order/OrderSteps'
import { SavePlanDialog } from './order/SavePlanDialog'
import { selectedWindow, WindowSelect } from './order/WindowSelect'
import { ParameterPanel } from './parameters/ParameterPanel'
import type { ParametersAction } from './parameters/state'
import { PLANNER_TABS } from './plannerTabs'
import type { TabProps } from './tabs/props'
import { tourActions } from '@/features/app/tour'
import type { CalculationResult, DerivedParameters, ParameterDefaults, Parameters } from './types'

// Cada pestaña (y Recharts) se descarga aparte, en paralelo con la primera llamada a la API
const OrderTab = lazy(() => import('./tabs/OrderTab'))
const DemandTab = lazy(() => import('./tabs/DemandTab'))
const SensitivityTab = lazy(() => import('./tabs/SensitivityTab'))
const VersionsTab = lazy(() => import('./tabs/VersionsTab'))
const CycleTab = lazy(() => import('./tabs/CycleTab'))

const PANEL_KEY = 'planner:panel-open'

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

function Chip({ label, value, help }: { label: string; value: ReactNode; help?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
      {help && <Help className="ml-0.5">{help}</Help>}
    </span>
  )
}

interface Props {
  tab: string | null
  params: {
    defaults: ParameterDefaults | null
    base: Parameters | null
    current: Parameters | null
    dirty: boolean
    dispatch: Dispatch<ParametersAction>
    error: string | null
    retry: () => void
  }
  calc: { result: CalculationResult | null; recalculating: boolean; error: string | null; retry: () => void }
  changes: string[]
}

export function PlannerPage({ tab: routeTab, params, calc, changes }: Props) {
  const tab = PLANNER_TABS.some((t) => t.value === routeTab) ? (routeTab as string) : 'pedido'
  // En pantallas anchas los supuestos van en una columna fija junto al resultado (como los planificadores
  // financieros: entradas a un lado, proyección al otro); en el móvil, en un drawer.
  const wide = useMediaQuery('(min-width: 1024px)')
  const [asideOpen, setAsideOpen] = useState(() => readStorage<boolean>(PANEL_KEY) ?? true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const panelOpen = wide ? asideOpen : drawerOpen
  const setPanelOpen = (open: boolean) => {
    if (wide) {
      setAsideOpen(open)
      writeStorage(PANEL_KEY, open)
    } else setDrawerOpen(open)
  }

  const { result } = calc
  const derived: DerivedParameters | null = result?.derived ?? params.defaults?.derived ?? null
  const error = params.error ?? calc.error

  // Lo que el recorrido guiado necesita hacer en esta pantalla
  useEffect(() => {
    tourActions.openPanel = () => setPanelOpen(true)
    tourActions.useCurrentWindow = () => params.dispatch({ type: 'setCutoff', cutoff: null, window: null })
    return () => {
      tourActions.openPanel = undefined
      tourActions.useCurrentWindow = undefined
    }
  })

  const panel =
    params.defaults && params.current && params.base && derived ? (
      <ParameterPanel
        defaults={params.defaults}
        base={params.base}
        parameters={params.current}
        derived={derived}
        correction={result?.correction ?? null}
        changes={changes}
        dispatch={params.dispatch}
      />
    ) : (
      <div className="space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )

  const tabProps: TabProps | null =
    result && params.current && params.defaults
      ? { result, parameters: params.current, defaults: params.defaults, changes, dispatch: params.dispatch }
      : null

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Planificación', href: '#/planificador' }, { label: 'Planificador de pedidos' }]}
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex" aria-live="polite">
              {calc.recalculating && result && (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Recalculando…
                </>
              )}
            </span>
            {params.dirty && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex"
                onClick={() => params.dispatch({ type: 'reset' })}
              >
                <RotateCcw />
                Restablecer
              </Button>
            )}
            {result && params.current && <SavePlanDialog result={result} parameters={params.current} onSaved={calc.retry} />}
          </>
        }
      />

      <div className="flex flex-1 items-stretch">
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <div className="@container min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Crear pedido a fábrica</h1>
                <div className="flex flex-wrap items-center gap-2">
                  {params.defaults && params.current && derived && (
                    <WindowSelect
                      options={params.defaults.cutoff_options}
                      parameters={params.current}
                      derived={derived}
                      dispatch={params.dispatch}
                    />
                  )}
                  {params.dirty && <Badge variant="secondary">Supuestos modificados</Badge>}
                </div>
              </div>
              {result && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip
                    label="Datos al"
                    value={date(result.calendar.cutoff_date)}
                    help="Última foto de inventario. Todo se calcula con lo que se sabía ese día."
                  />
                  <Chip
                    label="Llega el"
                    value={date(result.calendar.arrival)}
                    help="Cuándo entra al patio lo que se pida en esta ventana: cierre de la ventana más el lead time."
                  />
                  <Chip label="Hasta que llegue" value={`${num1(result.calendar.gap_months)} m`} help={G.hueco} />
                  <Chip label="Debe cubrir" value={`${num1(result.calendar.horizon_months)} m`} help={G.horizonte} />
                </div>
              )}
            </div>

            {result && params.current && params.defaults && derived && (
              <OrderSteps
                result={result}
                window={selectedWindow(params.defaults.cutoff_options, params.current, derived)}
                changes={changes.filter((c) => !c.includes(': ')).length}
                overrides={Object.keys(params.current.overrides).length}
                panelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen(!panelOpen)}
                save={<SavePlanDialog result={result} parameters={params.current} onSaved={calc.retry} />}
              />
            )}

            {result && result.pipeline.length > 0 && (
              <Alert>
                <Info />
                <AlertDescription>
                  Cuenta como tránsito lo ya planificado:{' '}
                  {result.pipeline
                    .map((p) => `«${p.name}» (${num0(p.total_units)} u., llega el ${date(p.arrival)})`)
                    .join(', ')}
                  .
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={tab} onValueChange={(v) => navigate(`planificador/${v}`)} className="gap-4">
              <div className="-mx-4 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:overflow-visible sm:px-0">
                <TabsList data-tour="tabs">
                  {PLANNER_TABS.map((t) => (
                    <TabsTrigger key={t.value} value={t.value} className="px-3">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>No se pudo calcular el pedido</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center gap-3">
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={() => (params.error ? params.retry() : calc.retry())}>
                      <RefreshCw />
                      Reintentar
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* El aviso de validación histórica lo muestra la pestaña Pedido con la comparación completa */}
              {result?.warnings
                .filter((w) => !w.startsWith('Validación histórica'))
                .map((w) => (
                  <Alert key={w}>
                    <AlertCircle />
                    <AlertDescription>{w}</AlertDescription>
                  </Alert>
                ))}

              {/* El resultado anterior queda visible (atenuado) mientras llega el nuevo */}
              <div
                className={cn('transition-opacity', calc.recalculating && result && 'opacity-60')}
                aria-busy={calc.recalculating}
              >
                <Suspense fallback={<Loading />}>
                  {PLANNER_TABS.map((t) => (
                    <TabsContent key={t.value} value={t.value}>
                      {!tabProps ? (
                        <Loading />
                      ) : t.value === 'pedido' ? (
                        <OrderTab {...tabProps} />
                      ) : t.value === 'demanda' ? (
                        <DemandTab {...tabProps} />
                      ) : t.value === 'sensibilidad' ? (
                        <SensitivityTab {...tabProps} />
                      ) : t.value === 'versiones' ? (
                        <VersionsTab {...tabProps} />
                      ) : (
                        <CycleTab {...tabProps} />
                      )}
                    </TabsContent>
                  ))}
                </Suspense>
              </div>
            </Tabs>
          </div>
        </div>

        {wide && asideOpen && (
          <aside
            data-tour="params-panel"
            aria-label="Supuestos"
            className="w-80 shrink-0 border-l bg-background xl:w-[22rem]"
          >
            {/* Pegada bajo el encabezado: el pedido se desplaza, los supuestos quedan a la vista */}
            <div className="sticky top-14 flex h-[calc(100svh-3.5rem-0.5rem)] flex-col px-4 pt-3 pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Supuestos</h2>
                <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen(false)} aria-label="Ocultar supuestos">
                  <X />
                </Button>
              </div>
              <div className="min-h-0 flex-1">{panel}</div>
            </div>
          </aside>
        )}
      </div>

      {/* Móvil y tablet: drawer no modal y sin arrastre, el pedido sigue visible y se recalcula al mover los parámetros */}
      {!wide && (
        <Drawer direction="right" modal={false} handleOnly open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="w-full shadow-xl sm:max-w-sm">
            <DrawerHeader className="flex-row items-center justify-between border-b py-3">
              <DrawerTitle>Supuestos</DrawerTitle>
              <DrawerDescription className="sr-only">Supuestos del cálculo</DrawerDescription>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Cerrar">
                  <X />
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <div className="min-h-0 flex-1 px-4 pt-4 pb-4">{panel}</div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  )
}
