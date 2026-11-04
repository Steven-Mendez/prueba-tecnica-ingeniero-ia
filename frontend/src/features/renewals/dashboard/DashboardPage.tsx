import { AlertCircle, RefreshCw } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'

import { ChartTip } from '@/components/charts/ChartTip'
import { COLORS } from '@/components/charts/colors'
import { DatePicker } from '@/components/DatePicker'
import { Stat } from '@/components/Stat'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import { fetchDayOverview } from '@/lib/api'
import { monthShort, num0, pct, pct1, usd, usdCompact } from '@/lib/format'
import { PageHeader } from '@/features/app/PageHeader'
import { stableStringify } from '@/features/factory-order/parameters/state'
import type { RenewalsCtx } from '../Caso2Shell'
import type { DayOverview } from '../types'

const capacityConfig = {
  first_contacts: { label: 'Primeros contactos', color: COLORS.primary },
  follow_ups: { label: 'Seguimientos', color: COLORS.reference },
} satisfies ChartConfig

const bucketConfig = {
  real: { label: 'Real (5 gestores)', color: COLORS.risk },
  simulated: { label: 'Simulado con las reglas', color: COLORS.recovered },
} satisfies ChartConfig

// Panel del jefe de renovaciones: qué entra hoy por canal, capacidad frente a carga, gestores y métricas del piloto
export default function DashboardPage({ ctx }: { ctx: RenewalsCtx }) {
  const { params, sim, day, setDay, contactsVersion } = ctx
  const derived = sim.result?.derived ?? params.defaults?.derived ?? null
  const p = params.current
  const { data, loading, error, reload } = useApi<DayOverview>(
    ctx.version && p && day ? `day:${ctx.version}:${day}:${contactsVersion}:${stableStringify(p)}` : null,
    (signal) => fetchDayOverview(p!, day!, signal),
  )
  const result = sim.result
  const capacity = result?.capacity.filter((_, i) => i % 1 === 0) ?? []

  return (
    <>
      <PageHeader crumbs={[{ label: 'Caso 2 · Renovaciones', href: '#/caso2/inicio' }, { label: 'Panel del jefe' }]} />
      <div className="flex-1 p-4 md:p-6">
        <div className="@container space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Panel del jefe de renovaciones</h1>
              <DatePicker value={day} min={derived?.day_min} max={derived?.day_max} weekdaysOnly onChange={setDay} aria-label="Día" />
            </div>
          </div>

          {(error || sim.error) && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>No se pudo cargar el panel</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{error ?? sim.error}</span>
                <Button variant="outline" size="sm" onClick={() => (sim.error ? sim.retry() : reload())}>
                  <RefreshCw />
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!data || !result ? (
            <div className="space-y-4">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-80 rounded-xl" />
            </div>
          ) : (
            <div className={loading ? 'space-y-4 opacity-60 transition-opacity' : 'space-y-4 transition-opacity'}>
              <Card className="gap-0 py-0" aria-label="Indicadores del día" data-tour="panel-kpis">
                <div className="grid @lg:grid-cols-2 @4xl:grid-cols-4">
                  <Stat
                    label="Pendientes de primer contacto"
                    help="Pólizas de la cola telefónica abiertas y sin primer contacto a este día."
                    value={num0(data.pending_first_contacts)}
                    detail={`${num0(data.follow_ups_estimate)} seguimientos estimados`}
                  />
                  <Stat
                    className="border-t @lg:border-t-0 @lg:border-l"
                    label="Carga frente a capacidad"
                    help="(Pendientes + seguimientos del día simulados) / capacidad diaria del equipo."
                    value={pct(data.load_share)}
                    detail={`Capacidad ${num0(data.capacity)} llamadas/día`}
                  />
                  <Stat
                    className="border-t @4xl:border-t-0 @4xl:border-l"
                    label="Uso medio de la capacidad"
                    help="En la simulación del periodo de 5 gestores. El notebook: 83 %, con uno de cada cuatro días al tope."
                    value={pct(result.stats.capacity_use_mean)}
                    detail={`${pct(result.stats.days_at_capacity_share)} de los días al tope`}
                  />
                  <Stat
                    className="border-t @lg:border-l @4xl:border-t-0"
                    label="Registrado hoy en ventana"
                    help="De los resultados anotados en la app este día, qué parte cae 8–14 días antes del vencimiento."
                    value={data.logged.in_window_share == null ? '—' : pct(data.logged.in_window_share)}
                    detail={`${num0(data.logged.count)} registros · ${num0(data.logged.effective)} efectivos`}
                  />
                </div>
              </Card>

              <div className="grid gap-4 @4xl:grid-cols-2">
                <Card data-tour="panel-routing">
                  <CardHeader>
                    <CardTitle>Qué entra hoy, por canal</CardTitle>
                    <CardDescription>Pólizas cuyo expediente se abre este día ({p?.open_days} días antes del vencimiento) y a qué canal van.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Canal</TableHead>
                          <TableHead className="text-right">Pólizas</TableHead>
                          <TableHead className="text-right">Comisión potencial</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.routed_today.map((r) => (
                          <TableRow key={r.channel}>
                            <TableCell>{r.channel}</TableCell>
                            <TableCell className="text-right tabular-nums">{num0(r.policies)}</TableCell>
                            <TableCell className="text-right tabular-nums">{usd(r.commission)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="mt-3 text-xs text-muted-foreground">
                      En el periodo de 5 gestores el enrutamiento saca de la cola ~{num0(result.channels.freed_calls_per_month)} llamadas al mes (
                      {pct(result.channels.freed_calls_per_month / result.channels.calls_per_month)} del total).
                    </p>
                  </CardContent>
                </Card>

                <Card data-tour="panel-agents">
                  <CardHeader>
                    <CardTitle>Por gestor</CardTitle>
                    <CardDescription>Pendientes y registros del día, y la tasa histórica de cada uno en la cola telefónica.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Gestor</TableHead>
                          <TableHead className="text-right">Pendientes</TableHead>
                          <TableHead className="text-right">Registradas</TableHead>
                          <TableHead className="text-right">En ventana</TableHead>
                          <TableHead className="text-right">Comisión en cola</TableHead>
                          <TableHead className="text-right">Tasa histórica</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.by_agent.map((a) => (
                          <TableRow key={a.agent}>
                            <TableCell>
                              {a.agent}
                              <span className="block text-xs text-muted-foreground">{a.name}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{num0(a.pending)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num0(a.logged)}</TableCell>
                            <TableCell className="text-right tabular-nums">{a.in_window_share == null ? '—' : pct(a.in_window_share)}</TableCell>
                            <TableCell className="text-right tabular-nums">{usdCompact(a.commission)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {result.pilot.agent_rates[a.agent] != null ? pct1(result.pilot.agent_rates[a.agent]) : '—'}
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
                    <CardTitle>Llamadas simuladas por día hábil</CardTitle>
                    <CardDescription>Primeros contactos y seguimientos en la cola telefónica frente a la capacidad del equipo.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={capacityConfig} className="h-64 w-full">
                      <AreaChart data={capacity} margin={{ left: 0, right: 8, top: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v: string) => monthShort(v)} />
                        <YAxis width={36} tickLine={false} axisLine={false} />
                        <Area dataKey="first_contacts" stackId="a" type="monotone" fill={COLORS.primary} stroke={COLORS.primary} fillOpacity={0.7} />
                        <Area dataKey="follow_ups" stackId="a" type="monotone" fill={COLORS.reference} stroke={COLORS.reference} fillOpacity={0.5} />
                        <ReferenceLine y={p?.daily_capacity ?? 250} stroke="var(--foreground)" strokeDasharray="4 4" label={{ value: `Capacidad ${p?.daily_capacity ?? 250}`, position: 'insideTopRight', fontSize: 11 }} />
                        <ChartTip config={capacityConfig} title={(l) => String(l)} />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card data-tour="panel-buckets">
                  <CardHeader>
                    <CardTitle>Primer contacto por tramo de anticipación</CardTitle>
                    <CardDescription>Cola telefónica, periodo de 5 gestores: hoy frente a la simulación con las reglas. La ventana que renueva es 8–14.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={bucketConfig} className="h-64 w-full">
                      <BarChart data={result.buckets} margin={{ left: 0, right: 8, top: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis width={40} tickLine={false} axisLine={false} tickFormatter={(v: number) => pct(v)} />
                        <Bar dataKey="real" fill={COLORS.risk} radius={3} />
                        <Bar dataKey="simulated" fill={COLORS.recovered} radius={3} />
                        <ChartTip config={bucketConfig} format={(v) => pct1(v)} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card data-tour="panel-metrics">
                <CardHeader>
                  <CardTitle>Indicadores del piloto</CardTitle>
                  <CardDescription>Línea base: el periodo de 5 gestores. Los registros de la app alimentan las columnas «hoy» a medida que se usa.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Métrica</TableHead>
                        <TableHead>Hoy (5 gestores)</TableHead>
                        <TableHead>Meta del piloto</TableHead>
                        <TableHead>Frecuencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.metrics.map((m) => (
                        <TableRow key={m.metric}>
                          <TableCell>{m.metric}</TableCell>
                          <TableCell className="tabular-nums">{m.today}</TableCell>
                          <TableCell>{m.target}</TableCell>
                          <TableCell className="text-muted-foreground">{m.frequency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
