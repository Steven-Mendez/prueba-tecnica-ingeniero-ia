import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { num1 } from '@/lib/format'
import type { Calendar, OrderRow } from '../types'
import { ChartTip, Legend } from './ChartTip'
import { COLORS, coverageChartConfig } from './config'
import { RefLabel } from './shapes'

// Port del panel derecho de la figura de gerencia: meses de cobertura hoy y tras el pedido
export function CoverageChart({ rows, calendar }: { rows: OrderRow[]; calendar: Calendar }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        model: r.model,
        today: r.coverage_today_months,
        after: r.coverage_after_order_months,
      })),
    [rows],
  )
  // La línea de mayor valor lleva su etiqueta hacia la izquierda (nunca se sale por la derecha) en la fila de abajo;
  // la de menor valor, hacia la derecha en la fila de arriba
  const gapFirst = calendar.gap_months < calendar.horizon_months
  const max = Math.max(
    calendar.gap_months,
    ...data.flatMap((d) => [d.today ?? 0, d.after ?? 0]).filter((v) => Number.isFinite(v)),
  )

  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: coverageChartConfig.today.label, color: COLORS.reference },
          { label: coverageChartConfig.after.label, color: COLORS.primary },
        ]}
      />
      <ChartContainer config={coverageChartConfig} className="aspect-auto h-[320px] w-full">
        <BarChart data={data} layout="vertical" margin={{ top: 46, right: 12, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid horizontal={false} />
          <YAxis
            type="category"
            dataKey="model"
            width="auto"
            tickLine={false}
            axisLine={false}
            interval={0}
            fontSize={11}
          />
          <XAxis
            type="number"
            domain={[0, Math.ceil(max + 0.5)]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v} m`}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={<ChartTip config={coverageChartConfig} format={(v) => `${num1(v)} m`} />}
          />
          <Bar dataKey="today" fill={COLORS.reference} radius={[0, 4, 4, 0]} maxBarSize={10} isAnimationActive={false} />
          <Bar dataKey="after" fill={COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={10} isAnimationActive={false} />
          <ReferenceLine
            x={calendar.gap_months}
            stroke={COLORS.risk}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={
              <RefLabel
                text={`Hueco ${num1(calendar.gap_months)} m`}
                color={COLORS.risk}
                align={gapFirst ? 'right' : 'left'}
                row={gapFirst ? 1 : 0}
              />
            }
          />
          <ReferenceLine
            x={calendar.horizon_months}
            stroke={COLORS.ink}
            strokeDasharray="2 4"
            strokeWidth={1.5}
            label={
              <RefLabel
                text={`Horizonte ${num1(calendar.horizon_months)} m`}
                color={COLORS.ink}
                align={gapFirst ? 'left' : 'right'}
                row={gapFirst ? 0 : 1}
              />
            }
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
