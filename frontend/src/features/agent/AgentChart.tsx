import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { ChartTip, Legend } from '@/features/factory-order/charts/ChartTip'
import { COLORS } from '@/features/factory-order/charts/config'
import { num0, num1 } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AgentChart as Spec } from './types'

const PALETTE = [COLORS.primary, COLORS.recovered, COLORS.risk, COLORS.ink]

// Gráfico que pide el asistente con datos que ya obtuvo de las herramientas; se dibuja con los mismos
// componentes y colores que el resto de la app.
export function AgentChart({ spec, size = 'sm' }: { spec: Spec; size?: 'sm' | 'md' }) {
  const config = Object.fromEntries(
    spec.series.map((s, i) => [s.key, { label: s.label, color: PALETTE[i % PALETTE.length] }]),
  ) satisfies ChartConfig
  const axis = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={spec.x_key} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
      <YAxis width="auto" tickLine={false} axisLine={false} tickFormatter={(v: number) => num0(v)} />
      <ChartTooltip content={<ChartTip config={config} format={(v) => num1(v)} />} />
    </>
  )
  return (
    <figure className={cn('space-y-2 rounded-lg border bg-card', size === 'md' ? 'p-4' : 'p-3')}>
      <figcaption className={cn('font-medium', size === 'md' ? 'text-sm' : 'text-xs')}>{spec.title}</figcaption>
      <Legend items={spec.series.map((s) => ({ label: s.label, color: config[s.key].color, shape: spec.kind === 'line' ? 'line' : 'square' }))} />
      <ChartContainer config={config} className={cn('aspect-auto w-full', size === 'md' ? 'h-80' : 'h-52')}>
        {spec.kind === 'line' ? (
          <LineChart data={spec.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {axis}
            {spec.series.map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={config[s.key].color} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        ) : (
          <BarChart data={spec.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            {axis}
            {spec.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={config[s.key].color} maxBarSize={32} isAnimationActive={false} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </figure>
  )
}
