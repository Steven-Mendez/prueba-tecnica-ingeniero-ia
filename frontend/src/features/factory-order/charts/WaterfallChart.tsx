import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { num0, num1 } from '@/lib/format'
import type { OrderRow } from '../types'
import { COLORS, waterfallChartConfig } from './config'

type StepKind = 'add' | 'subtract' | 'total'

interface Step {
  step: string
  base: number
  value: number
  signed: number
  kind: StepKind
}

// Cascada «cómo se llega»: demanda del horizonte + seguridad − posición − tránsito = bruto → redondeo → pedido
function buildSteps(r: OrderRow): Step[] {
  const raw: { step: string; signed: number; kind: StepKind }[] = [
    { step: 'Demanda horizonte', signed: r.horizon_demand, kind: 'add' },
    { step: 'Seguridad', signed: r.safety_stock, kind: 'add' },
    { step: 'Posición al llegar', signed: -r.position_at_arrival, kind: 'subtract' },
  ]
  if (r.transit_in_horizon > 0) raw.push({ step: 'Tránsito horizonte', signed: -r.transit_in_horizon, kind: 'subtract' })
  raw.push({ step: 'Bruto', signed: r.gross_order, kind: 'total' })
  if (r.manual_adjustment) {
    raw.push({ step: 'Ajuste manual', signed: r.manual_adjustment, kind: r.manual_adjustment > 0 ? 'add' : 'subtract' })
  }
  const toRound = r.gross_order + r.manual_adjustment
  raw.push({ step: 'Redondeo', signed: r.computed_order - toRound, kind: r.computed_order >= toRound ? 'add' : 'subtract' })
  if (r.forced_order != null) {
    raw.push({ step: 'Forzado', signed: r.order - r.computed_order, kind: r.order >= r.computed_order ? 'add' : 'subtract' })
  }
  raw.push({ step: 'Pedido', signed: r.order, kind: 'total' })

  let level = 0
  return raw.map((s) => {
    if (s.kind === 'total') {
      level = s.signed
      return { ...s, base: Math.min(0, s.signed), value: Math.abs(s.signed) }
    }
    const start = level
    level += s.signed
    return { ...s, base: Math.min(start, level), value: Math.abs(s.signed) }
  })
}

const FILL: Record<StepKind, string> = {
  total: COLORS.primary,
  add: COLORS.primarySoft,
  subtract: COLORS.reference,
}

export function WaterfallChart({ row }: { row: OrderRow }) {
  const steps = useMemo(() => buildSteps(row), [row])
  const low = Math.min(0, ...steps.map((s) => s.base))

  return (
    <ChartContainer config={waterfallChartConfig} className="aspect-auto h-[220px] w-full">
      <BarChart data={steps} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="step"
          interval={0}
          tickLine={false}
          axisLine={false}
          fontSize={10}
          height={36}
          tick={({ x, y, payload }) => {
            const [a, ...b] = String(payload.value).split(' ')
            return (
              <text x={x} y={Number(y) + 10} textAnchor="middle" fill="var(--muted-foreground)" fontSize={10}>
                <tspan x={x}>{a}</tspan>
                {b.length > 0 && (
                  <tspan x={x} dy={12}>
                    {b.join(' ')}
                  </tspan>
                )}
              </text>
            )
          }}
        />
        <YAxis width="auto" tickLine={false} axisLine={false} domain={[Math.floor(low), 'auto']} fontSize={10} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={({ active, payload }) => {
            const s = payload?.[0]?.payload as Step | undefined
            if (!active || !s) return null
            return (
              <div className="rounded-lg border border-border/50 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
                <span className="font-medium">{s.step}</span>{' '}
                <span className="font-mono tabular-nums">
                  {s.kind === 'total' ? '' : s.signed >= 0 ? '+' : '−'}
                  {num1(Math.abs(s.signed))} u.
                </span>
              </div>
            )
          }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={34} isAnimationActive={false}>
          {steps.map((s) => (
            <Cell key={s.step} fill={FILL[s.kind]} />
          ))}
          <LabelList
            dataKey="signed"
            position="top"
            className="fill-foreground"
            fontSize={11}
            formatter={(v: unknown) => {
              const n = Number(v)
              if (Math.abs(n) < 0.05) return '0'
              const abs = Math.abs(n)
              return `${n > 0 ? '' : '−'}${Number.isInteger(abs) ? num0(abs) : num1(abs)}`
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
