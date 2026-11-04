import { AlertCircle, Download, Loader2, RefreshCw, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Chip } from '@/components/Chip'
import { Delta, Stat } from '@/components/Stat'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { downloadQueueCsv } from '@/lib/api'
import { cn } from '@/lib/utils'
import { num0, num1, pct, pct1, usd, usdCompact } from '@/lib/format'
import { PageHeader } from '@/features/app/PageHeader'
import { tourActions } from '@/features/app/tour'
import { AssumptionsPanel } from '../parameters/AssumptionsPanel'
import type { RenewalsCtx } from '../Caso2Shell'
import type { SimulationResult } from '../types'

const PANEL_KEY = 'renewals:panel-open'

const money = (v: number) => `${v > 0 ? '+' : '−'}${usdCompact(Math.abs(v))}`

function ImpactSummary({ result }: { result: SimulationResult }) {
  const { impact: i, baseline: b, stats } = result
  return (
    <Card className="gap-0 py-0" aria-label="Impacto esperado" data-tour="assumptions-impact">
      <div className="grid @lg:grid-cols-2 @4xl:grid-cols-4">
        <Stat
          label="Piso"
          help="La cola telefónica vuelve a la tasa que tuvo con 7 gestores: un estado observado."
          value={`${usdCompact(i.floor_month)}/mes`}
          delta={b && <Delta value={i.floor_month - b.floor_month} format={money} />}
          detail={`${pct(i.rate_7g)} frente a ${pct(i.collected_rate)} hoy`}
        />
        <Stat
          className="border-t @lg:border-t-0 @lg:border-l"
          label="Meta del piloto"
          help="Interpola entre el % en ventana de hoy y el de la simulación hasta la meta elegida."
          value={`${usdCompact(i.target_month)}/mes`}
          delta={b && <Delta value={i.target_month - b.target_month} format={money} />}
          detail={`${pct(result.parameters.target_window_share)} en ventana desde el ${pct(i.share_window_today)} de hoy`}
        />
        <Stat
          className="border-t @4xl:border-t-0 @4xl:border-l"
          label="Techo"
          help="La simulación completa. El valor bajo valora cada contacto por su día de anticipación (o con la tabla de 7 gestores); el alto, con la tasa media del tramo."
          value={`${usdCompact(i.ceiling_low_month)}–${usdCompact(i.ceiling_high_month)}`}
          delta={b && <Delta value={i.ceiling_high_month - b.ceiling_high_month} format={money} />}
          detail={`${pct(i.share_window_sim)} en ventana · tasa esperada ${pct1(i.expected_sim_rate)}`}
        />
        <Stat
          className="border-t @lg:border-l @4xl:border-t-0"
          label="Referencia del diagnóstico"
          help="Caída bruta de comisión al pasar de 7 a 5 gestores y pérdida estratificada por contacto tardío (01_eda §8)."
          value={`${usdCompact(i.reference_low_month)}–${usdCompact(i.reference_high_month)}`}
          detail={stats.unassigned ? `${num0(stats.unassigned)} pólizas sin cupo` : 'Todas las pólizas con primer contacto'}
        />
      </div>
    </Card>
  )
}

function Content({ result, p }: { result: SimulationResult; p: NonNullable<RenewalsCtx['params']['current']> }) {
  const { comparison, capacity_sensitivity, rates, improvement, channels, pilot, impact } = result
  return (
    <div className="space-y-4">
      <ImpactSummary result={result} />
      {impact.automatic_adjustment_month !== 0 && (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            Ajuste del canal automático con la tasa indicada: {usd(impact.automatic_adjustment_month)} al mes (aparte del rango de arriba).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card data-tour="assumptions-comparison">
          <CardHeader>
            <CardTitle>Anticipación del primer contacto</CardTitle>
            <CardDescription>Cola telefónica del periodo de 5 gestores: real frente a la simulación con las reglas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Simulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((r) => (
                  <TableRow key={r.metric}>
                    <TableCell>{r.metric}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.kind === 'days' ? num0(r.real) : pct(r.real)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.kind === 'days' ? num0(r.simulated) : pct(r.simulated)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Uso medio de la capacidad {pct(result.stats.capacity_use_mean)} · {pct(result.stats.days_at_capacity_share)} de los días al tope ·{' '}
              {pct(result.stats.opened_later_share)} de las pólizas abiertas un día hábil después por falta de cupo.
            </p>
          </CardContent>
        </Card>

        <Card data-tour="assumptions-sensitivity">
          <CardHeader>
            <CardTitle>Sensibilidad a la capacidad</CardTitle>
            <CardDescription>El resultado lo producen la apertura a {p.open_days} días y el margen de capacidad, no el orden de la cola.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Llamadas/día</TableHead>
                  <TableHead className="text-right">En ventana 8-14</TableHead>
                  <TableHead className="text-right">A ≤ 3 días</TableHead>
                  <TableHead className="text-right">Sin primer contacto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capacity_sensitivity.map((r) => (
                  <TableRow key={r.capacity} className={r.capacity === p.daily_capacity ? 'bg-muted/40' : undefined}>
                    <TableCell className="tabular-nums">{num0(r.capacity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.share_window)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.share_le3)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num0(r.unassigned)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card data-tour="assumptions-rates">
          <CardHeader>
            <CardTitle>Tasa de renovación por segmento y tramo</CardTitle>
            <CardDescription>Cola telefónica, 13 meses (S2.15). La prioridad es comisión × mejora esperada: tasa en 8-14 menos tasa a 0-3.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmento</TableHead>
                  {rates.buckets.map((b) => (
                    <TableHead key={b} className="text-right whitespace-nowrap">
                      {b}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Mejora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.segments.map((seg, i) => (
                  <TableRow key={seg}>
                    <TableCell>{seg}</TableCell>
                    {rates.rates[i].map((v, j) => (
                      <TableCell
                        key={j}
                        className={cn('text-right tabular-nums', rates.buckets[j] === '8-14' && 'bg-chart-2/10 font-medium')}
                        title={`${num0(rates.counts[i][j])} pólizas`}
                      >
                        {v == null ? '—' : pct(v)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">
                      {(() => {
                        const m = improvement.find((x) => x.segment === seg)
                        return m ? `+${pct(m.improvement)}` : '—'
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enrutamiento por canal</CardTitle>
            <CardDescription>Periodo de 5 gestores ({impact.months} meses). Salen de la cola ~{num0(channels.freed_calls_per_month)} llamadas al mes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Pólizas</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  <TableHead className="text-right">Renueva</TableHead>
                  <TableHead className="text-right">Llamadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.period.map((r) => (
                  <TableRow key={r.channel}>
                    <TableCell className="max-w-56 truncate" title={r.channel}>
                      {r.channel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num0(r.policies)} <span className="text-xs text-muted-foreground">({pct(r.share_policies)})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usdCompact(r.commission)} <span className="text-xs text-muted-foreground">({pct(r.share_commission)})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct1(r.renewal_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num0(r.calls)} <span className="text-xs text-muted-foreground">({pct(r.share_calls)})</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Validación y rango del techo</CardTitle>
            <CardDescription>Por qué el impacto se reporta como rango y no como una sola cifra.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Comisión potencial {usd(impact.potential)} en {impact.months} meses; cobrada {usd(impact.collected)} ({pct1(impact.collected_rate)}). Con los tramos
              reales la tabla reproduce {usd(impact.expected_real)} ({pct1(impact.expected_real / impact.collected - 1)} frente a lo cobrado).
            </p>
            <p>
              Fuera de muestra, la tabla ajustada solo con 7 gestores da {usd(impact.out_of_sample_expected)} ({pct1(impact.out_of_sample_expected / impact.collected - 1)}),
              pero en el tramo 8-14 se desvía {pct1(impact.deviation_814)} y el {pct(impact.share_g03_814)} de sus pólizas recientes son de G03.
            </p>
            <p>
              Techo valorado por día de anticipación: {usdCompact(impact.ceiling_day_month)}/mes (tasa {pct1(impact.expected_sim_day_rate)}); con la tabla de 7
              gestores: {usdCompact(impact.ceiling_7g_month)}/mes; con la tasa media del tramo: {usdCompact(impact.ceiling_high_month)}/mes. Por eso el piloto
              debería probar abrir a 12 días frente a 14.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tamaño del piloto</CardTitle>
            <CardDescription>A/B por póliza dentro de cada gestor, no por gestor entero.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Tasa base en la cola telefónica {pct1(pilot.base_rate)}. Para detectar +{pct(pilot.delta)} con 95 % de confianza y 80 % de potencia hacen falta
              ~{num0(pilot.n_per_arm)} pólizas por brazo. Con ~{num0(pilot.policies_per_agent_month)} pólizas por gestor y mes, un piloto por póliza necesita
              ~{num1(pilot.months)} meses.
            </p>
            <p className="text-muted-foreground">
              Por qué no por gestor: la tasa en la cola va de {pct(Math.min(...Object.values(pilot.agent_rates)))} a {pct(Math.max(...Object.values(pilot.agent_rates)))}{' '}
              según el gestor; la línea base se movería más que lo que se quiere medir.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Supuestos y simulación: entradas a un lado, resultado al otro (como el planificador del Caso 1)
export default function AssumptionsPage({ ctx }: { ctx: RenewalsCtx }) {
  const { params, sim, changes, day } = ctx
  const wide = useMediaQuery('(min-width: 1024px)')
  const [asideOpen, setAsideOpen] = useState(() => readStorage<boolean>(PANEL_KEY) ?? true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const setPanelOpen = (open: boolean) => {
    if (wide) {
      setAsideOpen(open)
      writeStorage(PANEL_KEY, open)
    } else setDrawerOpen(open)
  }
  const result = sim.result
  const derived = result?.derived ?? params.defaults?.derived ?? null
  const error = params.error ?? sim.error

  // Lo que el recorrido guiado necesita hacer en esta pantalla
  useEffect(() => {
    tourActions.openPanel = () => setPanelOpen(true)
    return () => {
      tourActions.openPanel = undefined
    }
  })

  const panel =
    params.base && params.current && derived ? (
      <AssumptionsPanel base={params.base} parameters={params.current} derived={derived} dispatch={params.dispatch} />
    ) : (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )

  const download = () => {
    if (!params.current || !day) return
    void downloadQueueCsv(params.current, day).then(
      (name) => toast.success(`Descargado ${name}`),
      (e: unknown) => toast.error('No se pudo descargar el CSV', { description: e instanceof Error ? e.message : String(e) }),
    )
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Caso 2 · Renovaciones', href: '#/caso2/inicio' }, { label: 'Supuestos y simulación' }]}
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex" aria-live="polite">
              {sim.recalculating && result && (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Recalculando…
                </>
              )}
            </span>
            {params.dirty && (
              <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => params.dispatch({ type: 'reset' })}>
                <RotateCcw />
                Restablecer
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={download} disabled={!params.current || !day}>
              <Download />
              <span className="hidden sm:inline">Cola del día (CSV)</span>
            </Button>
            <Button
              variant={asideOpen && wide ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setPanelOpen(!(wide ? asideOpen : drawerOpen))}
              data-tour="assumptions-button"
            >
              <SlidersHorizontal />
              Supuestos
            </Button>
          </>
        }
      />

      <div className="flex flex-1 items-stretch">
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <div className="@container min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Simulación con 5 gestores</h1>
                <div className="flex flex-wrap items-center gap-2">
                  {params.dirty && <Badge variant="secondary">Supuestos modificados</Badge>}
                  {changes.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
              {result && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip label="Periodo" value={`${result.impact.months} meses`} help="Vencimientos con 5 gestores: dic-2025 → sep-2026." />
                  <Chip label="Cola telefónica" value={`${num0(result.stats.policies)} pólizas`} help="Pago manual de individuales y pymes con teléfono válido." />
                  {result.notebook_check && (
                    <Chip
                      label="Notebook"
                      value={result.notebook_check.matches ? 'coincide' : 'difiere'}
                      help={
                        result.notebook_check.matches
                          ? `Con estos supuestos la cola del ${derived?.default_day} coincide byte a byte con ${result.notebook_check.file} y el impacto es el del notebook.`
                          : `Difiere de ${result.notebook_check.file}: ${result.notebook_check.differences.join('; ')}`
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>No se pudo simular</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={() => (params.error ? params.retry() : sim.retry())}>
                    <RefreshCw />
                    Reintentar
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {result?.warnings.map((w) => (
              <Alert key={w}>
                <AlertCircle />
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}

            <div className={cn('transition-opacity', sim.recalculating && result && 'opacity-60')} aria-busy={sim.recalculating}>
              {result && params.current ? (
                <Content result={result} p={params.current} />
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-28 rounded-xl" />
                  <Skeleton className="h-96 rounded-xl" />
                </div>
              )}
            </div>
          </div>
        </div>

        {wide && asideOpen && (
          <aside aria-label="Supuestos" data-tour="assumptions-panel" className="w-80 shrink-0 border-l bg-background xl:w-[22rem]">
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

      {!wide && (
        <Drawer direction="right" modal={false} handleOnly open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="w-full shadow-xl sm:max-w-sm">
            <DrawerHeader className="flex-row items-center justify-between border-b py-3">
              <DrawerTitle>Supuestos</DrawerTitle>
              <DrawerDescription className="sr-only">Supuestos de la simulación</DrawerDescription>
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
