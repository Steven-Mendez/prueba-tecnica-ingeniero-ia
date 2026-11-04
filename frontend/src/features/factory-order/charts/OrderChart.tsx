import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { months, num0, num1 } from '@/lib/format'
import type { Calendar, OrderRow } from '../types'
import { ChartTip, Legend } from './ChartTip'
import { COLORS, orderChartConfig } from './config'
import { ModelTick, PreviousMark, StackSegment, TargetDot } from './shapes'

// Port de la figura de gerencia del notebook (§10, panel izquierdo): qué cubre el pedido
export function OrderChart({ rows, calendar }: { rows: OrderRow[]; calendar: Calendar }) {
  const config = orderChartConfig(calendar.window_label, calendar.previous_window_label, calendar.horizon_label)
  const data = useMemo(
    () =>
      rows.map((r) => ({
        model: r.model,
        position: r.position_at_arrival,
        order: r.order,
        target: r.horizon_demand + r.safety_stock,
        previous: r.previous_window_order,
        coverage: r.coverage_after_order_months,
      })),
    [rows],
  )

  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: config.position.label, color: COLORS.reference },
          { label: config.order.label, color: COLORS.primary },
          { label: config.target.label, color: COLORS.risk, shape: 'dot' },
          { label: config.previous.label, color: COLORS.ink, shape: 'line' },
        ]}
      />
      <div className="-mx-2 overflow-x-auto px-2">
        <ChartContainer config={config} className="aspect-auto h-[320px] w-full min-w-[560px]">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="model" interval={0} tickLine={false} axisLine={false} height={40} tick={<ModelTick />} />
            <YAxis width="auto" tickLine={false} axisLine={false} allowDecimals={false} />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={
                <ChartTip
                  config={config}
                  format={(v, key) => (key === 'order' || key === 'previous' ? num0(v) : num1(v))}
                  footer={(row) => (
                    <div className="border-t pt-1.5 text-muted-foreground">
                      Cobertura tras el pedido: {months(row?.coverage as number | null)}
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="position"
              stackId="a"
              fill={COLORS.reference}
              maxBarSize={44}
              isAnimationActive={false}
              shape={<StackSegment above={['order']} />}
            />
            <Bar
              dataKey="order"
              stackId="a"
              fill={COLORS.primary}
              maxBarSize={44}
              isAnimationActive={false}
              shape={<StackSegment below={['position']} />}
            />
            <Line
              dataKey="target"
              stroke="none"
              isAnimationActive={false}
              dot={<TargetDot fill={COLORS.risk} />}
              activeDot={false}
              legendType="circle"
            />
            <Line
              dataKey="previous"
              stroke="none"
              isAnimationActive={false}
              dot={<PreviousMark stroke={COLORS.ink} />}
              activeDot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  )
}
