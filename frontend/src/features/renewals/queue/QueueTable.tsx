import { ChevronRight, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { deleteContact } from '@/lib/api'
import { cn } from '@/lib/utils'
import { date, num0, pct, signedPct, usd } from '@/lib/format'
import { ResultDialog } from './ResultDialog'
import type { QueueRow } from '../types'

interface Props {
  rows: QueueRow[]
  day: string
  showAgent: boolean
  onChanged: () => void
}

function DeadlineBadge({ days }: { days: number }) {
  const variant = days < 0 ? 'destructive' : days <= 2 ? 'secondary' : 'outline'
  const label = days < 0 ? `vencida hace ${-days} d` : days === 0 ? 'hoy' : `${days} d`
  return (
    <Badge variant={variant} className={cn('tabular-nums', days <= 2 && days >= 0 && 'border-chart-2 text-chart-2')}>
      {label}
    </Badge>
  )
}

// La cola ordenada por fecha límite y score, con el botón para registrar el resultado de la llamada
export function QueueTable({ rows, day, showAgent, onChanged }: Props) {
  const pending = rows.filter((r) => r.status === 'pending')
  const logged = rows.filter((r) => r.status === 'logged')

  const undo = async (row: QueueRow) => {
    if (!row.contact_id) return
    try {
      await deleteContact(row.contact_id)
      toast.success(`Registro deshecho: ${row.policy} vuelve a la cola`)
      onChanged()
    } catch (e: unknown) {
      toast.error('No se pudo deshacer', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0" data-tour="queue-table">
        <CardContent className="p-0">
          <div className="max-h-[calc(100svh-24rem)] min-h-48 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
                <TableRow>
                  <TableHead className="w-8 text-right">#</TableHead>
                  <TableHead>Póliza</TableHead>
                  <TableHead>Cliente · teléfono</TableHead>
                  <TableHead>Ramo · segmento</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Para la fecha límite</TableHead>
                  <TableHead className="text-right">Prima</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  {showAgent && <TableHead>Gestor</TableHead>}
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showAgent ? 11 : 10} className="py-10 text-center text-muted-foreground">
                      No hay pólizas pendientes de primer contacto para este día.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((r, i) => (
                    <TableRow key={r.policy}>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.policy}
                        <span className="block text-xs text-muted-foreground">{r.insurer}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.client_id}
                        <span className="block text-xs text-muted-foreground tabular-nums">{r.phone ?? '—'}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.line}
                        <span className="block text-xs text-muted-foreground">
                          {r.segment} · {r.payment}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {date(r.expiry)}
                        <span className="block text-xs text-muted-foreground">en {r.days_to_expiry} d</span>
                      </TableCell>
                      <TableCell>
                        <DeadlineBadge days={r.days_to_deadline} />
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {usd(r.renewal_premium)}
                        <span className={cn('block text-xs', r.premium_change > 0.1 ? 'text-chart-3' : 'text-muted-foreground')}>
                          {signedPct(r.premium_change)} vs. {usd(r.previous_premium)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{usd(r.potential_commission)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {usd(r.score)}
                        <span className="block text-xs text-muted-foreground">mejora {pct(r.improvement)}</span>
                      </TableCell>
                      {showAgent && <TableCell>{r.agent}</TableCell>}
                      <TableCell className="text-right">
                        <ResultDialog row={r} day={day} onSaved={onChanged} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {logged.length > 0 && (
        <Collapsible defaultOpen className="group rounded-xl border bg-card">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium">
            <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
            Registradas ({num0(logged.length)})
            <span className="text-xs font-normal text-muted-foreground">resultado anotado este día o antes</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Table>
              <TableBody>
                {logged.map((r) => (
                  <TableRow key={r.policy}>
                    <TableCell className="font-medium whitespace-nowrap">{r.policy}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.client_id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.last_result}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">vence {date(r.expiry)}</TableCell>
                    {showAgent && <TableCell>{r.agent}</TableCell>}
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => void undo(r)}>
                        <Undo2 />
                        Deshacer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
