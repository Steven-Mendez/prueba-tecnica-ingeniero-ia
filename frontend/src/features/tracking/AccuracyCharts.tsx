import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { num0, pct } from '@/lib/format'
import { ChartTip, Legend } from '@/features/factory-order/charts/ChartTip'
import { COLORS } from '@/features/factory-order/charts/config'
import { PreviousMark } from '@/features/factory-order/charts/shapes'
import type { AccuracyCycle } from '@/features/factory-order/types'

const demandConfig = {
  projected: { label: 'Demanda proyectada', color: COLORS.primary },
  realized: { label: 'Demanda real (ajustada)', color: COLORS.recovered },
  realized_sales: { label: 'Venta registrada', color: COLORS.ink },
} satisfies ChartConfig

// Demanda del horizonte que proyectó la herramienta con lo que se sabía al corte, frente a la que hubo
export function DemandAccuracyChart({ cycles }: { cycles: AccuracyCycle[] }) {
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: demandConfig.projected.label, color: COLORS.primary },
          { label: demandConfig.realized.label, color: COLORS.recovered },
          { label: demandConfig.realized_sales.label, color: COLORS.ink, shape: 'line' },
        ]}
      />
      <ChartContainer config={demandConfig} className="aspect-auto h-[280px] w-full">
        <ComposedChart data={cycles} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="window_label" tickLine={false} axisLine={false} interval={0} />
          <YAxis width="auto" tickLine={false} axisLine={false} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={
              <ChartTip
                config={demandConfig}
                title={(label, row) => `Ventana ${String(label)} · horizonte ${String(row?.horizon_label ?? '')}`}
                format={(v) => num0(v)}
                footer={(row) => (
                  <div className="border-t pt-1.5 text-muted-foreground">
                    Error por modelo (WAPE) {pct(row?.wape as number | null)}
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="projected" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="realized" fill={COLORS.recovered} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Line
            dataKey="realized_sales"
            stroke="none"
            isAnimationActive={false}
            dot={<PreviousMark stroke={COLORS.ink} />}
            activeDot={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

const orderConfig = {
  tool_order: { label: 'Pedido de la herramienta', color: COLORS.primary },
  actual_order: { label: 'Pedido real', color: COLORS.reference },
} satisfies ChartConfig

export function OrderComparisonChart({ cycles }: { cycles: AccuracyCycle[] }) {
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: orderConfig.tool_order.label, color: COLORS.primary },
          { label: orderConfig.actual_order.label, color: COLORS.reference },
        ]}
      />
      <ChartContainer config={orderConfig} className="aspect-auto h-[240px] w-full">
        <ComposedChart data={cycles} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="window_label" tickLine={false} axisLine={false} interval={0} />
          <YAxis width="auto" tickLine={false} axisLine={false} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={<ChartTip config={orderConfig} title={(label) => `Ventana ${String(label)}`} format={(v) => num0(v)} />}
          />
          <Bar dataKey="tool_order" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="actual_order" fill={COLORS.reference} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
