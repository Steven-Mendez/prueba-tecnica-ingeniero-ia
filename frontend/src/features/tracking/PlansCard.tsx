import { ChevronRight, ExternalLink, Send, Trash2, Undo2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Term } from '@/components/Term'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { deletePlan, updatePlan } from '@/lib/api'
import { date, dateTime, num0, num1, pct, signedPct, usdCompact } from '@/lib/format'
import type { Parameters, Plan } from '@/features/factory-order/types'

function TrackingCell({ plan }: { plan: Plan }) {
  const t = plan.tracking
  if (t.state === 'pending') {
    return <span className="text-muted-foreground">Empieza el {date(plan.arrival)}</span>
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Progress value={t.elapsed_share * 100} className="h-1.5 w-20" aria-label="Horizonte transcurrido" />
        <span className="text-xs text-muted-foreground tabular-nums">{pct(t.elapsed_share)}</span>
      </div>
      <div className="text-xs">
        {t.state === 'closed' ? 'Cerrado' : 'En curso'} · error {pct(t.wape)} · sesgo {signedPct(t.bias)}
      </div>
    </div>
  )
}

interface Props {
  plans: Plan[]
  onChanged: () => void
  onOpen: (parameters: Parameters) => void
}

export function PlansCard({ plans, onChanged, onOpen }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Plan | null>(null)

  const setStatus = async (plan: Plan, status: Plan['status']) => {
    try {
      await updatePlan(plan.id, { status })
      toast.success(status === 'sent' ? `«${plan.name}» marcado como enviado a fábrica` : `«${plan.name}» vuelve a borrador`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async () => {
    if (!toDelete) return
    try {
      await deletePlan(toDelete.id)
      toast.success(`Plan «${toDelete.name}» eliminado`)
      setToDelete(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planes guardados</CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Todavía no hay planes</EmptyTitle>
              <EmptyDescription>Se guardan desde el planificador.</EmptyDescription>
            </EmptyHeader>
            <Button asChild size="sm">
              <a href="#/planificador">Ir al planificador</a>
            </Button>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Plan</TableHead>
                  <TableHead>Ventana</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Capital</TableHead>
                  <TableHead><Term help={G.plan_seguimiento}>Seguimiento</Term></TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const isOpen = open === plan.id
                  return (
                    <Fragment key={plan.id}>
                      <TableRow className={cn(isOpen && 'border-b-0 bg-muted/40')}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setOpen(isOpen ? null : plan.id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Ocultar' : 'Ver'} el detalle de ${plan.name}`}
                          >
                            <ChevronRight className={cn('transition-transform', isOpen && 'rotate-90')} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{plan.name}</div>
                          <div className="text-xs text-muted-foreground">Guardado el {dateTime(plan.created_at)}</div>
                        </TableCell>
                        <TableCell>
                          <div>{plan.window_label}</div>
                          <div className="text-xs text-muted-foreground">Corte {date(plan.cutoff_date)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={plan.status === 'sent' ? 'default' : 'secondary'}>
                            {plan.status === 'sent' ? 'Enviado a fábrica' : 'Borrador'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num0(plan.total_units)}</TableCell>
                        <TableCell className="text-right tabular-nums">{usdCompact(plan.capital_usd)}</TableCell>
                        <TableCell>
                          <TrackingCell plan={plan} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon-sm" onClick={() => onOpen(plan.parameters)} aria-label="Abrir en el planificador">
                            <ExternalLink />
                          </Button>
                          {plan.status === 'draft' ? (
                            <Button variant="ghost" size="icon-sm" onClick={() => setStatus(plan, 'sent')} aria-label="Marcar como enviado">
                              <Send />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon-sm" onClick={() => setStatus(plan, 'draft')} aria-label="Volver a borrador">
                              <Undo2 />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(plan)} aria-label="Eliminar">
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={8} className="p-4 whitespace-normal">
                            {plan.note && <p className="mb-3 text-sm">{plan.note}</p>}
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Modelo</TableHead>
                                  <TableHead className="text-right">Pedido</TableHead>
                                  <TableHead className="text-right">
                                    <Term help={G.demanda_proyectada_plan}>
                                      Demanda proyectada{plan.tracking.state === 'in_progress' ? ' (a la fecha)' : ''}
                                    </Term>
                                  </TableHead>
                                  <TableHead className="text-right"><Term help={G.real}>Demanda real</Term></TableHead>
                                  <TableHead className="text-right"><Term help={G.venta_registrada}>Venta registrada</Term></TableHead>
                                  <TableHead className="text-right"><Term help={G.diferencia_plan}>Diferencia</Term></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {plan.tracking.models.map((m) => (
                                  <TableRow key={m.model}>
                                    <TableCell>{m.model}</TableCell>
                                    <TableCell className="text-right tabular-nums">{num0(m.tool_order)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{num1(m.projected)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {plan.tracking.state === 'pending' ? '—' : num1(m.realized)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {plan.tracking.state === 'pending' ? '—' : num1(m.realized_sales)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {plan.tracking.state === 'pending' || m.projected <= 0
                                        ? '—'
                                        : signedPct(m.realized / m.projected - 1)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar el plan «{toDelete?.name}»?</DialogTitle>
            <DialogDescription>Se pierde su seguimiento. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove}>
              <Trash2 />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
