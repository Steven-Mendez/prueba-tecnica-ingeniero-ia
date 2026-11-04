import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { monthLong, monthShort, num0, signedPct, usd } from '@/lib/format'
import { ChartTip, Legend } from '@/features/factory-order/charts/ChartTip'
import { COLORS } from '@/features/factory-order/charts/config'
import { StackSegment } from '@/features/factory-order/charts/shapes'
import type { SalesGroup, SalesMonth } from './types'

const monthlyConfig = {
  units: { label: 'Venta neta', color: COLORS.primary },
  lost_units: { label: 'Perdida por disponibilidad', color: COLORS.risk },
  units_prev_year: { label: 'Venta del año anterior', color: COLORS.ink },
} satisfies ChartConfig

// Venta por mes con la venta perdida por falta de disponibilidad encima: juntas son la demanda observada
export function MonthlySalesChart({ months, showPrevYear }: { months: SalesMonth[]; showPrevYear: boolean }) {
  const data = useMemo(() => months.map((m) => ({ ...m, units: Math.max(0, m.units) })), [months])
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: monthlyConfig.units.label, color: COLORS.primary },
          { label: monthlyConfig.lost_units.label, color: COLORS.risk },
          ...(showPrevYear ? [{ label: monthlyConfig.units_prev_year.label, color: COLORS.ink, shape: 'line' as const }] : []),
        ]}
      />
      <ChartContainer config={monthlyConfig} className="aspect-auto h-[300px] w-full">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={monthShort}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis width="auto" tickLine={false} axisLine={false} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={
              <ChartTip
                config={monthlyConfig}
                hide={showPrevYear ? [] : ['units_prev_year']}
                title={(label) => monthLong(String(label))}
                format={(v) => num0(v)}
                footer={(row) => (
                  <div className="border-t pt-1.5 text-muted-foreground">Ingresos {usd(row?.revenue_usd as number)}</div>
                )}
              />
            }
          />
          <Bar
            dataKey="units"
            stackId="m"
            fill={COLORS.primary}
            maxBarSize={36}
            isAnimationActive={false}
            shape={<StackSegment above={['lost_units']} />}
          />
          <Bar
            dataKey="lost_units"
            stackId="m"
            fill={COLORS.risk}
            maxBarSize={36}
            isAnimationActive={false}
            shape={<StackSegment below={['units']} />}
          />
          {showPrevYear && (
            <Line
              dataKey="units_prev_year"
              stroke={COLORS.ink}
              strokeWidth={1.5}
              dot={false}
              type="monotone"
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

const groupConfig = {
  units: { label: 'Unidades', color: COLORS.primary },
} satisfies ChartConfig

// Barras horizontales ordenadas (un solo color: las categorías no tienen orden ni identidad de color)
export function GroupBarChart({ groups, height }: { groups: SalesGroup[]; height?: number }) {
  return (
    <ChartContainer
      config={groupConfig}
      className="aspect-auto w-full"
      style={{ height: height ?? Math.max(120, groups.length * 30 + 16) }}
    >
      <BarChart data={groups} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap="24%">
        <CartesianGrid horizontal={false} />
        <YAxis type="category" dataKey="label" width="auto" tickLine={false} axisLine={false} interval={0} fontSize={11} />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} fontSize={10} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={({ active, payload }) => {
            const g = payload?.[0]?.payload as SalesGroup | undefined
            if (!active || !g) return null
            const change = g.units_prev_year ? g.units / g.units_prev_year - 1 : null
            return (
              <div className="grid min-w-44 gap-1 rounded-lg border border-border/50 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
                <div className="font-medium">{g.label}</div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Unidades</span>
                  <span className="font-mono tabular-nums">{num0(g.units)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Ingresos</span>
                  <span className="font-mono tabular-nums">{usd(g.revenue_usd)}</span>
                </div>
                {g.units_prev_year != null && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Año anterior</span>
                    <span className="font-mono tabular-nums">
                      {num0(g.units_prev_year)} {change != null && `(${signedPct(change)})`}
                    </span>
                  </div>
                )}
              </div>
            )
          }}
        />
        <Bar
          dataKey="units"
          fill={COLORS.primary}
          radius={[0, 4, 4, 0]}
          maxBarSize={16}
          isAnimationActive={false}
          label={{ position: 'right', fontSize: 11, fill: 'var(--foreground)', formatter: (v: unknown) => num0(Number(v)) }}
        />
      </BarChart>
    </ChartContainer>
  )
}
