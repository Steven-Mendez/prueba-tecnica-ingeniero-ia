import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { num0, signedNum, usd } from '@/lib/format'
import type { Scenario } from '../types'
import { COLORS, scenarioChartConfig } from './config'

// Total de unidades por escenario (§9): el actual resaltado, el resto en gris de referencia
export function ScenarioChart({ scenarios }: { scenarios: Scenario[] }) {
  const current = scenarios.find((s) => s.key === 'current')
  const base = current?.total_units ?? 0
  const data = scenarios.map((s) => ({ ...s, diff: s.total_units - base }))
  const max = Math.max(...data.map((d) => d.total_units))

  return (
    <ChartContainer config={scenarioChartConfig} className="aspect-auto w-full" style={{ height: 36 * data.length + 24 }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid horizontal={false} />
        <YAxis type="category" dataKey="name" width="auto" tickLine={false} axisLine={false} interval={0} fontSize={11} />
        <XAxis type="number" domain={[0, Math.ceil((max * 1.05) / 50) * 50]} tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={({ active, payload }) => {
            const s = payload?.[0]?.payload as (Scenario & { diff: number }) | undefined
            if (!active || !s) return null
            return (
              <div className="grid max-w-64 gap-1 rounded-lg border border-border/50 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
                <div className="font-medium">{s.name}</div>
                <div className="text-muted-foreground">{s.description}</div>
                <div className="flex justify-between gap-4 font-mono tabular-nums">
                  <span>{num0(s.total_units)} u.</span>
                  {s.key !== 'current' && <span>{signedNum(s.diff)} vs actual</span>}
                </div>
                <div className="font-mono tabular-nums text-muted-foreground">{usd(s.capital_usd)}</div>
              </div>
            )
          }}
        />
        <ReferenceLine x={base} stroke={COLORS.ink} strokeDasharray="2 4" />
        <Bar dataKey="total_units" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.key === 'current' ? COLORS.primary : COLORS.reference} />
          ))}
          <LabelList dataKey="total_units" position="right" className="fill-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
