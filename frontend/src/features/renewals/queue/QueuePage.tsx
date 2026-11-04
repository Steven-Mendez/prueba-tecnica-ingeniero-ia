import { AlertCircle, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Chip } from '@/components/Chip'
import { DatePicker } from '@/components/DatePicker'
import { Stat } from '@/components/Stat'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { downloadQueueCsv, fetchDailyQueue } from '@/lib/api'
import { cn } from '@/lib/utils'
import { num0, pct } from '@/lib/format'
import { PageHeader } from '@/features/app/PageHeader'
import { stableStringify } from '@/features/factory-order/parameters/state'
import type { RenewalsCtx } from '../Caso2Shell'
import { QueueTable } from './QueueTable'
import type { DailyQueue } from '../types'

const ALL = '__all__'

// Lo que vería el gestor cada mañana: la cola pendiente de primer contacto, ordenada por fecha límite y valor
export default function QueuePage({ ctx }: { ctx: RenewalsCtx }) {
  const { params, day, setDay, agent, setAgent, contactsVersion, bumpContacts } = ctx
  const derived = ctx.sim.result?.derived ?? params.defaults?.derived ?? null
  const p = params.current
  const { data, loading, error, reload } = useApi<DailyQueue>(
    ctx.version && p && day ? `queue:${ctx.version}:${day}:${agent ?? ''}:${contactsVersion}:${stableStringify(p)}` : null,
    (signal) => fetchDailyQueue(p!, day!, agent, signal),
  )
  const onChanged = () => {
    bumpContacts()
    reload()
  }
  const download = (pendingOnly: boolean) => {
    if (!p || !day) return
    void downloadQueueCsv(p, day, pendingOnly).then(
      (name) => toast.success(`Descargado ${name}`),
      (e: unknown) => toast.error('No se pudo descargar el CSV', { description: e instanceof Error ? e.message : String(e) }),
    )
  }
  const agents = data?.agents ?? derived?.team.filter((m) => m.active) ?? []

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Caso 2 · Renovaciones', href: '#/caso2/inicio' }, { label: 'Cola del día' }]}
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex" aria-live="polite">
              {loading && data && (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Actualizando…
                </>
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => download(false)} disabled={!p || !day}>
              <Download />
              <span className="hidden sm:inline">Descargar cola (CSV)</span>
            </Button>
          </>
        }
      />
      <div className="flex-1 p-4 md:p-6">
        <div className="@container space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">A quién llamar hoy</h1>
              <div className="flex flex-wrap items-center gap-2" data-tour="queue-day">
                <DatePicker
                  value={day}
                  min={derived?.day_min}
                  max={derived?.day_max}
                  weekdaysOnly
                  onChange={setDay}
                  aria-label="Día de la cola"
                />
                <Select value={agent ?? ALL} onValueChange={(v) => setAgent(v === ALL ? null : v)}>
                  <SelectTrigger className="w-56" aria-label="Gestor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos los gestores</SelectItem>
                    {agents.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {m.code} · {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {params.dirty && <Badge variant="secondary">Supuestos modificados</Badge>}
              </div>
            </div>
            {data && p && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip label="Apertura" value={`${p.open_days} d`} help="La póliza entra a la cola estos días antes del vencimiento (S2.16)." />
                <Chip label="Fecha límite" value={`${p.deadline_days} d`} help="Primer contacto a más tardar estos días antes del vencimiento: fin de la ventana 8–14." />
                <Chip label="Capacidad" value={`${num0(data.capacity_per_agent)}/gestor`} help="Llamadas por gestor y día hábil con los supuestos actuales." />
                {data.notebook_check && (
                  <Chip
                    label="Notebook"
                    value={data.notebook_check.matches ? 'coincide' : 'difiere'}
                    help={
                      data.notebook_check.matches
                        ? `La cola de este día coincide byte a byte con ${data.notebook_check.file}.`
                        : `Difiere de ${data.notebook_check.file}: ${data.notebook_check.differences.join('; ')}`
                    }
                  />
                )}
              </div>
            )}
          </div>

          {(error || params.error) && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>No se pudo armar la cola</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{error ?? params.error}</span>
                <Button variant="outline" size="sm" onClick={() => (params.error ? params.retry() : reload())}>
                  <RefreshCw />
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {data?.warnings.map((w) => (
            <Alert key={w}>
              <AlertCircle />
              <AlertDescription>{w}</AlertDescription>
            </Alert>
          ))}

          {!data ? (
            <div className="space-y-4">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-96 rounded-xl" />
            </div>
          ) : (
            <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
              <Card className="gap-0 py-0" aria-label="Indicadores del día" data-tour="queue-kpis">
                <div className="grid @lg:grid-cols-2 @4xl:grid-cols-4">
                  <Stat
                    label="Pendientes de primer contacto"
                    help="Pólizas de la cola telefónica abiertas y sin primer contacto registrado a este día."
                    value={num0(data.total_pending)}
                    detail={agent ? `de ${agent}` : `${data.by_agent.map((a) => `${a.agent} ${a.pending}`).join(' · ')}`}
                  />
                  <Stat
                    className="border-t @lg:border-t-0 @lg:border-l"
                    label="Registradas hoy"
                    help="Resultados anotados en la app este día (cualquier resultado cuenta como primer intento, S2.8)."
                    value={num0(data.logged.count)}
                    detail={data.logged.count ? `${num0(data.logged.effective)} con contacto efectivo` : 'Ninguna todavía'}
                  />
                  <Stat
                    className="border-t @4xl:border-t-0 @4xl:border-l"
                    label="En ventana 8–14"
                    help="De lo registrado hoy, qué parte cae entre 8 y 14 días antes del vencimiento. Meta del piloto: 70 %."
                    value={data.logged.in_window_share == null ? '—' : pct(data.logged.in_window_share)}
                    detail={data.logged.median_lead == null ? 'Sin registros' : `Anticipación mediana ${num0(data.logged.median_lead)} d`}
                  />
                  <Stat
                    className="border-t @lg:border-l @4xl:border-t-0"
                    label="Carga frente a capacidad"
                    help="Pendientes hoy frente a la capacidad del equipo por día (primeros contactos; los seguimientos van aparte)."
                    value={pct(data.total_pending / Math.max(1, data.capacity_per_agent * data.agents.length))}
                    detail={`${num0(data.total_pending)} de ${num0(data.capacity_per_agent * data.agents.length)} llamadas`}
                  />
                </div>
              </Card>
              <QueueTable rows={data.rows} day={data.day} showAgent={!agent} onChanged={onChanged} />
              <p className="text-xs text-muted-foreground">
                Orden: primero las pólizas más cerca de su fecha límite; a igual fecha, las de mayor score (comisión potencial ×
                mejora esperada del segmento). El CSV completo reproduce el del notebook;{' '}
                <button type="button" className="underline" onClick={() => download(true)}>
                  descargar solo pendientes
                </button>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
