import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { num0, num1 } from '@/lib/format'
import type { VersionRow } from '../types'
import { ChartTip } from './ChartTip'
import { COLORS, versionChartConfig } from './config'

// Reparto del pedido del modelo por versión según el faltante de cada una (§8)
export function VersionChart({ rows }: { rows: VersionRow[] }) {
  const data = [...rows].sort((a, b) => b.order - a.order || b.shortfall - a.shortfall)
  return (
    <ChartContainer
      config={versionChartConfig}
      className="aspect-auto w-full"
      style={{ height: Math.max(90, 34 * data.length + 16) }}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} />
        <YAxis type="category" dataKey="version" width="auto" tickLine={false} axisLine={false} interval={0} fontSize={11} />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} fontSize={10} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={
            <ChartTip
              config={versionChartConfig}
              format={(v, key) => (key === 'order' ? num0(v) : num1(v))}
              footer={(row) => {
                const r = row as unknown as VersionRow | undefined
                if (!r) return null
                return (
                  <div className="grid grid-cols-2 gap-x-3 border-t pt-1.5 text-muted-foreground">
                    <span>Demanda 12 m</span>
                    <span className="text-right tabular-nums">{num0(r.demand_window)}</span>
                    <span>Stock + tránsito</span>
                    <span className="text-right tabular-nums">{num0(r.stock_at_cutoff + r.in_transit)}</span>
                    <span>Necesidad</span>
                    <span className="text-right tabular-nums">{num1(r.need_until_horizon_end)}</span>
                  </div>
                )
              }}
            />
          }
        />
        <Bar dataKey="shortfall" fill={COLORS.reference} radius={[0, 4, 4, 0]} maxBarSize={10} isAnimationActive={false} />
        <Bar dataKey="order" fill={COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={10} isAnimationActive={false}>
          <LabelList dataKey="order" position="right" className="fill-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
