import { AlertCircle, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Term } from '@/components/Term'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { fetchAccuracy, fetchPlans } from '@/lib/api'
import { date, num0, num2, pct, signedPct } from '@/lib/format'
import { useApi } from '@/hooks/useApi'
import { PageHeader } from '@/features/app/PageHeader'
import type { Accuracy, Parameters, Plan } from '@/features/factory-order/types'
import { DemandAccuracyChart, OrderComparisonChart } from './AccuracyCharts'
import { PlansCard } from './PlansCard'

function Stat({ label, help, value, detail, className }: { label: string; help: ReactNode; value: ReactNode; detail?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 px-5 py-4', className)}>
      <span className="text-sm text-muted-foreground">
        <Term help={help}>{label}</Term>
      </span>
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
}

// Sesgo con barra divergente: azul si la demanda real superó la proyectada, rojo si quedó por debajo
function BiasBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  const width = Math.min(50, Math.abs(value) * 200)
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="w-12 text-right tabular-nums">{signedPct(value)}</span>
      <div className="relative h-1.5 w-24 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className={cn('absolute inset-y-0 rounded-full', value >= 0 ? 'left-1/2 bg-chart-1' : 'right-1/2 bg-chart-3')}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

interface Props {
  version: string | null
  onOpenPlan: (parameters: Parameters) => void
  onApplyCorrection: () => void
}

export default function TrackingPage({ version, onOpenPlan, onApplyCorrection }: Props) {
  const accuracy = useApi<Accuracy>(version ? `accuracy:${version}` : null, (signal) => fetchAccuracy(signal))
  const plans = useApi<Plan[]>(version ? `plans:${version}` : null, (signal) => fetchPlans(signal))
  const a = accuracy.data

  return (
    <>
      <PageHeader crumbs={[{ label: 'Planificación', href: '#/planificador' }, { label: 'Seguimiento' }]} />
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Seguimiento</h1>

        {(accuracy.error || plans.error) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{accuracy.error ?? plans.error}</AlertDescription>
          </Alert>
        )}

        {!a ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : (
          <>
            <Card className="gap-0 py-0" data-tour="tracking-kpis">
              <div className="grid sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Ciclos medidos" help={G.ciclos_medidos} value={num0(a.cycles.length)} detail="Con el horizonte completo" />
                <Stat
                  className="border-t sm:border-t-0 sm:border-l"
                  label="Error del pronóstico"
                  help={G.error_pronostico}
                  value={pct(a.wape)}
                  detail="WAPE"
                />
                <Stat
                  className="border-t xl:border-t-0 xl:border-l"
                  label="Sesgo"
                  help={G.sesgo}
                  value={signedPct(a.bias)}
                  detail={a.bias != null && a.bias < 0 ? 'Proyectó de más' : 'Proyectó de menos'}
                />
                <Stat
                  className="border-t sm:border-l xl:border-t-0"
                  label="Próximo ciclo medible"
                  help={G.proximo_ciclo}
                  value={a.next_cycle_closes ? date(a.next_cycle_closes) : '—'}
                />
              </div>
            </Card>

            <div className="grid gap-4 2xl:grid-cols-2" data-tour="tracking-charts">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Term help={G.grafico_demanda_real}>Demanda proyectada frente a la real</Term>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DemandAccuracyChart cycles={a.cycles} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Term help={G.grafico_pedido_real}>Pedido de la herramienta frente al pedido real</Term>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <OrderComparisonChart cycles={a.cycles} />
                </CardContent>
              </Card>
            </div>

            <Card data-tour="tracking-models">
              <CardHeader>
                <CardTitle>Precisión por modelo y corrección aprendida</CardTitle>
                <CardDescription>
                  Real / proyectada, acotada a ±25 %, con {a.correction_cycles} ciclos cerrados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modelo</TableHead>
                        <TableHead className="text-right"><Term help={G.proyectada}>Proyectada</Term></TableHead>
                        <TableHead className="text-right"><Term help={G.real}>Real</Term></TableHead>
                        <TableHead className="text-right"><Term help={G.sesgo}>Sesgo</Term></TableHead>
                        <TableHead className="text-right"><Term help={G.error_pronostico}>Error</Term></TableHead>
                        <TableHead className="text-right"><Term help={G.correccion}>Corrección</Term></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.models.map((m) => (
                        <TableRow key={m.model}>
                          <TableCell className="font-medium">{m.model}</TableCell>
                          <TableCell className="text-right tabular-nums">{num0(m.projected)}</TableCell>
                          <TableCell className="text-right tabular-nums">{num0(m.realized)}</TableCell>
                          <TableCell>
                            <BiasBar value={m.bias} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{pct(m.wape)}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.correction != null ? `×${num2(m.correction)}` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button size="sm" variant="outline" onClick={onApplyCorrection} disabled={a.correction_cycles < 2}>
                  <Sparkles />
                  Aplicar la corrección en el planificador
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {plans.data && (
          <div data-tour="tracking-plans">
            <PlansCard plans={plans.data} onChanged={plans.reload} onOpen={onOpenPlan} />
          </div>
        )}
      </div>
    </>
  )
}
