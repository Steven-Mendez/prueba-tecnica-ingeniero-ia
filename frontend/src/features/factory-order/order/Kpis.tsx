import { ArrowDownRight, ArrowUpRight, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { Term } from '@/components/Term'
import { Card } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { cn } from '@/lib/utils'
import { num0, signedNum, usd, usdCompact } from '@/lib/format'
import type { CalculationResult } from '../types'

// Cambio frente a la referencia (valores por defecto): flecha de color y cifra en tinta de texto
export function Delta({ value, format = signedNum }: { value: number; format?: (v: number) => string }) {
  if (Math.abs(value) < 0.5) return null
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground tabular-nums">
      <Icon className={cn('size-3.5', up ? 'text-chart-1' : 'text-chart-3')} aria-hidden />
      {format(value)}
    </span>
  )
}

function Stat({
  label,
  help,
  value,
  delta,
  detail,
  icon,
  className,
}: {
  className?: string
  label: string
  help: ReactNode
  value: ReactNode
  delta?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1 px-5 py-4', className)}>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        <Term help={help}>{label}</Term>
      </span>
      {/* Cifra héroe: misma familia, sin tabular-nums */}
      <span className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight">
        {value}
        {delta}
      </span>
      {detail && <span className="text-xs leading-snug text-muted-foreground">{detail}</span>}
    </div>
  )
}

// Franja de indicadores en una sola tarjeta con divisores (como los resúmenes de proyección de Xero o Cake)
export function Kpis({ result }: { result: CalculationResult }) {
  const { kpis, calendar, baseline } = result
  const diff = kpis.total_units - kpis.previous_window_units
  return (
    <Card className="gap-0 py-0" aria-label="Indicadores del pedido">
      <div className="grid @lg:grid-cols-2 @4xl:grid-cols-4">
        <Stat
          label="Unidades a pedir"
          help={G.unidades_a_pedir}
          value={num0(kpis.total_units)}
          delta={baseline && <Delta value={kpis.total_units - baseline.total_units} />}
          detail={
            <>
              {kpis.previous_window_units > 0
                ? `${signedNum(diff)} frente a ${calendar.previous_window_label} (${num0(kpis.previous_window_units)})`
                : `Ventana ${calendar.window_label}`}
              {kpis.actual_window_units != null && (
                <span className="block">Pedido real de {calendar.window_label}: {num0(kpis.actual_window_units)}</span>
              )}
            </>
          }
        />
        <Stat
          className="border-t @lg:border-t-0 @lg:border-l"
          label="Capital comprometido"
          help={G.capital}
          value={usdCompact(kpis.capital_usd)}
          delta={
            baseline && (
              <Delta
                value={kpis.capital_usd - baseline.capital_usd}
                format={(v) => `${v > 0 ? '+' : '−'}${usdCompact(Math.abs(v))}`}
              />
            )
          }
          detail={usd(kpis.capital_usd)}
        />
        <Stat
          className="border-t @4xl:border-t-0 @4xl:border-l"
          label="Modelos con pedido"
          help={G.modelos_con_pedido}
          value={`${kpis.models_with_order} de ${kpis.models_total}`}
          detail={kpis.zero_order_models.length ? `En cero: ${kpis.zero_order_models.join(', ')}` : 'Todos con pedido'}
        />
        <Stat
          className="border-t @lg:border-l @4xl:border-t-0"
          label="Venta no atendible en el hueco"
          help={G.venta_no_atendible}
          icon={kpis.unmet_gap_demand >= 1 ? <TriangleAlert className="size-3.5 text-chart-3" aria-hidden /> : null}
          value={`${num0(kpis.unmet_gap_demand)} u.`}
          detail={
            kpis.unmet_gap_demand >= 1
              ? `~${num0(kpis.gap_substitution_inflow)} como otro modelo · ~${num0(kpis.first_month_loss)} en ${calendar.first_gap_month_label}`
              : 'Cubierto por stock y tránsito'
          }
        />
      </div>
    </Card>
  )
}
