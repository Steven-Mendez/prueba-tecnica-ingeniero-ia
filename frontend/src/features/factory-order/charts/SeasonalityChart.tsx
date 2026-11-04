import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { num2 } from '@/lib/format'
import type { Calendar, SeasonalityPoint } from '../types'
import { ChartTip, Legend } from './ChartTip'
import { COLORS, seasonalityChartConfig } from './config'

// Índice estacional de la demanda ajustada (§4): resalta los meses del hueco y del horizonte
export function SeasonalityChart({ points, calendar }: { points: SeasonalityPoint[]; calendar: Calendar }) {
  const fill = (p: SeasonalityPoint) => (p.in_gap ? COLORS.risk : p.in_horizon ? COLORS.primary : COLORS.reference)
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: `Hueco (factor ${num2(calendar.gap_seasonal_factor)})`, color: COLORS.risk },
          { label: `Horizonte (factor ${num2(calendar.horizon_seasonal_factor)})`, color: COLORS.primary },
          { label: 'Otros meses', color: COLORS.reference },
        ]}
      />
      <ChartContainer config={seasonalityChartConfig} className="aspect-auto h-[220px] w-full">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} />
          <YAxis width="auto" tickLine={false} axisLine={false} domain={[0, 'auto']} tickFormatter={(v: number) => `${v}x`} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={
              <ChartTip
                config={seasonalityChartConfig}
                format={(v) => `${num2(v)}x`}
                footer={(row) =>
                  row?.in_gap || row?.in_horizon ? (
                    <div className="border-t pt-1.5 text-muted-foreground">
                      {row.in_gap ? 'En el hueco' : ''}
                      {row.in_gap && row.in_horizon ? ' y ' : ''}
                      {row.in_horizon ? 'en el horizonte' : ''}
                    </div>
                  ) : null
                }
              />
            }
          />
          <ReferenceLine y={1} stroke={COLORS.ink} strokeWidth={1} />
          <Bar dataKey="index" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.month} fill={fill(p)} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
