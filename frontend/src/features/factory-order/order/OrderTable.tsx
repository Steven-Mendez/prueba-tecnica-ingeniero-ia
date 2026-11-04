import { ChevronRight, Undo2 } from 'lucide-react'
import { Term } from '@/components/Term'
import { G } from '@/lib/glossary'
import { Fragment, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/NumberInput'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { months, num0, num1, usd } from '@/lib/format'
import { WaterfallChart } from '../charts/WaterfallChart'
import type { CalculationResult, Catalog, ModelOverride, Parameters } from '../types'
import { Delta } from './Kpis'
import { ModelOverrides } from './ModelOverrides'

const CASE_LABEL = {
  covered: 'Cubierto por la posición',
  below_minimum: 'Bajo el mínimo',
  ordered: 'Pedido',
  forced: 'Fijado a mano',
} as const

interface Props {
  result: CalculationResult
  parameters: Parameters
  catalog: Catalog
  onOverride: (model: string, patch: Partial<ModelOverride>) => void
  onClearOverride: (model: string) => void
}

export function OrderTable({ result, parameters, catalog, onOverride, onClearOverride }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const hasActualOrder = result.kpis.actual_window_units != null
  const hasActualSales = result.kpis.actual_horizon_sales != null
  const baseline = result.baseline
  const columns = 12 + (hasActualOrder ? 1 : 0) + (hasActualSales ? 1 : 0) + (baseline ? 1 : 0)
  const explanations = Object.fromEntries(result.explanations.map((e) => [e.model, e]))
  const totals = result.order.reduce(
    (acc, r) => ({ order: acc.order + r.order, previous: acc.previous + r.previous_window_order, capital: acc.capital + r.capital_usd }),
    { order: 0, previous: 0, capital: 0 },
  )

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[780px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Modelo</TableHead>
            <TableHead className="text-right"><Term help={G.demanda_mensual}>Dem. / mes</Term></TableHead>
            <TableHead className="text-right"><Term help={G.cobertura_hoy}>Cob. hoy</Term></TableHead>
            <TableHead className="text-right"><Term help={G.posicion}>Posición</Term></TableHead>
            <TableHead className="text-right"><Term help={G.demanda_mas_seguridad}>Dem. + seg.</Term></TableHead>
            <TableHead className="text-right"><Term help={G.bruto}>Bruto</Term></TableHead>
            <TableHead className="text-right"><Term help={G.min_mult}>Mín. / múlt.</Term></TableHead>
            <TableHead className="text-right"><Term help={G.pedido}>Pedido</Term></TableHead>
            {baseline && (
              <TableHead className="text-right">
                <Term help={G.impacto}>Impacto</Term>
              </TableHead>
            )}
            <TableHead className="text-right"><Term help={G.ventana_anterior}>{result.calendar.previous_window_label}</Term></TableHead>
            {hasActualOrder && (
              <TableHead className="text-right">
                <Term help={G.pedido_real}>Real {result.calendar.window_label}</Term>
              </TableHead>
            )}
            {hasActualSales && (
              <TableHead className="text-right">
                <Term help={G.venta_real_horizonte}>Venta real horizonte</Term>
              </TableHead>
            )}
            <TableHead className="text-right"><Term help={G.capital}>Capital</Term></TableHead>
            <TableHead className="text-right"><Term help={G.cobertura_final}>Cob. final</Term></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.order.map((r) => {
            const isOpen = open === r.model
            const override = parameters.overrides[r.model]
            const explanation = explanations[r.model]
            return (
              <Fragment key={r.model}>
                <TableRow
                  className={cn('cursor-pointer', isOpen && 'border-b-0 bg-muted/40')}
                  onClick={() => setOpen(isOpen ? null : r.model)}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Ocultar' : 'Ver'} cómo se llega al pedido de ${r.model}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen(isOpen ? null : r.model)
                      }}
                    >
                      <ChevronRight className={cn('transition-transform', isOpen && 'rotate-90')} />
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {r.model}
                      {r.end_of_life && (
                        <Badge variant="outline" className="text-[10px]">
                          última ventana
                        </Badge>
                      )}
                      {override && <span className="size-1.5 rounded-full bg-chart-2" aria-label="con ajustes" />}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num1(r.monthly_demand)}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      (r.coverage_today_months ?? 99) < result.calendar.gap_months && 'text-chart-3',
                    )}
                  >
                    {months(r.coverage_today_months)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num1(r.position_at_arrival)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num1(r.horizon_demand + r.safety_stock)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num1(r.gross_order + r.manual_adjustment)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.min_order} / {r.lot_multiple}
                  </TableCell>
                  {/* La cantidad se edita aquí mismo: escribir otra la fija a mano; la recomendación queda debajo */}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-end gap-0.5">
                      <NumberInput
                        inputMode="numeric"
                        min={0}
                        max={5000}
                        step={1}
                        className={cn(
                          'h-7 w-20 px-2 text-right font-semibold tabular-nums',
                          r.forced_order != null && 'border-chart-2 bg-chart-2/10',
                        )}
                        value={r.order}
                        onCommit={(v) => {
                          if (v == null) return
                          const n = Math.round(v)
                          onOverride(r.model, { forced_order: n === r.computed_order ? null : n })
                        }}
                        aria-label={`Cantidad a pedir de ${r.model}`}
                      />
                      {r.forced_order != null && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => onOverride(r.model, { forced_order: null })}
                            >
                              <Undo2 className="size-3" aria-hidden />
                              recomendado {r.computed_order}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Fijado a mano. Clic para volver a la recomendación.</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  {baseline && (
                    <TableCell className="text-right">
                      {r.order === (baseline.orders[r.model] ?? 0) ? (
                        <span className="text-muted-foreground">·</span>
                      ) : (
                        <Delta value={r.order - (baseline.orders[r.model] ?? 0)} />
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {num0(r.previous_window_order)}
                  </TableCell>
                  {hasActualOrder && (
                    <TableCell className="text-right tabular-nums">{num0(r.actual_window_order)}</TableCell>
                  )}
                  {hasActualSales && (
                    <TableCell className="text-right tabular-nums">{num0(r.actual_horizon_sales)}</TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">{usd(r.capital_usd)}</TableCell>
                  <TableCell className="text-right tabular-nums">{months(r.coverage_after_order_months)}</TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={columns} className="p-4 whitespace-normal">
                      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            Cómo se llega · {explanation ? CASE_LABEL[explanation.case] : ''}
                          </div>
                          <p className="text-sm leading-relaxed">{explanation?.text}</p>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <dt>Stock al corte</dt>
                            <dd className="text-right tabular-nums text-foreground">{num0(r.stock_at_cutoff)}</dd>
                            <dt>En tránsito (llega antes)</dt>
                            <dd className="text-right tabular-nums text-foreground">{num0(r.in_transit)}</dd>
                            <dt>Demanda hasta la llegada</dt>
                            <dd className="text-right tabular-nums text-foreground">{num1(r.demand_until_arrival)}</dd>
                            <dt>Sustitución entrante</dt>
                            <dd className="text-right tabular-nums text-foreground">{num1(r.substitution_inflow)}</dd>
                            <dt>Venta no atendible</dt>
                            <dd className="text-right tabular-nums text-foreground">{num1(r.unmet_gap_demand)}</dd>
                            <dt>Nivel de servicio</dt>
                            <dd className="text-right tabular-nums text-foreground">
                              {Math.round(r.service_level * 100)} %
                            </dd>
                          </dl>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted-foreground">Cascada del pedido (u.)</div>
                          <WaterfallChart row={r} />
                        </div>
                        <ModelOverrides
                          row={r}
                          override={override}
                          defaultRule={catalog.rules[r.model]}
                          onChange={(patch) => onOverride(r.model, patch)}
                          onClear={() => onClearOverride(r.model)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell />
            <TableCell colSpan={7}>Total</TableCell>
            <TableCell className="text-right tabular-nums font-semibold">{num0(totals.order)}</TableCell>
            {baseline && (
              <TableCell className="text-right">
                <Delta value={totals.order - baseline.total_units} />
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums text-muted-foreground">{num0(totals.previous)}</TableCell>
            {hasActualOrder && (
              <TableCell className="text-right tabular-nums">{num0(result.kpis.actual_window_units)}</TableCell>
            )}
            {hasActualSales && (
              <TableCell className="text-right tabular-nums">{num0(result.kpis.actual_horizon_sales)}</TableCell>
            )}
            <TableCell className="text-right tabular-nums">{usd(totals.capital)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
