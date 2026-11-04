import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { monthLong, monthShort, num0 } from '@/lib/format'
import type { ModelHistory } from '../types'
import { ChartTip } from './ChartTip'
import { COLORS, historyChartConfig } from './config'
import { StackSegment } from './shapes'

// Venta y demanda recuperada por mes (§3 del notebook); los meses en quiebre van sombreados.
// En los modelos que recibieron sustitución, parte de la venta era de clientes de otro modelo: se muestra en gris.
export function ModelHistoryChart({ history, showStock }: { history: ModelHistory; showStock: boolean }) {
  const data = useMemo(
    () =>
      history.points.map((p) => ({
        month: p.month,
        own: Math.min(p.sales, p.adjusted_demand),
        returned: Math.max(0, p.sales - p.adjusted_demand),
        recovered: Math.max(0, p.adjusted_demand - p.sales),
        stock_end: p.stock_end,
        stockout: p.stockout,
        sales: p.sales,
        adjusted: p.adjusted_demand,
      })),
    [history],
  )

  return (
    <ChartContainer config={historyChartConfig} className="aspect-auto h-[170px] w-full">
      <ComposedChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} />
        {data
          .filter((p) => p.stockout)
          .map((p) => (
            <ReferenceArea key={p.month} x1={p.month} x2={p.month} fill={COLORS.risk} fillOpacity={0.12} stroke="none" />
          ))}
        <XAxis dataKey="month" tickLine={false} axisLine={false} interval={2} tickFormatter={monthShort} fontSize={10} />
        <YAxis width="auto" tickLine={false} axisLine={false} allowDecimals={false} fontSize={10} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={
            <ChartTip
              config={historyChartConfig}
              hide={showStock ? [] : ['stock_end']}
              title={(label) => monthLong(String(label))}
              format={(v) => num0(v)}
              footer={(row) => (
                <div className="space-y-0.5 border-t pt-1.5 text-muted-foreground">
                  <div>
                    Venta {num0(row?.sales as number)} · demanda ajustada {num0(row?.adjusted as number)}
                  </div>
                  {Boolean(row?.stockout) && <div className="text-chart-3">Mes en quiebre: empezó o terminó en cero</div>}
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="own"
          stackId="h"
          fill={COLORS.primary}
          isAnimationActive={false}
          shape={<StackSegment above={['returned', 'recovered']} />}
        />
        <Bar
          dataKey="returned"
          stackId="h"
          fill={COLORS.reference}
          isAnimationActive={false}
          shape={<StackSegment below={['own']} above={['recovered']} />}
        />
        <Bar
          dataKey="recovered"
          stackId="h"
          fill={COLORS.recovered}
          isAnimationActive={false}
          shape={<StackSegment below={['own', 'returned']} />}
        />
        {showStock && (
          <Line dataKey="stock_end" stroke={COLORS.ink} strokeWidth={1.5} dot={false} type="monotone" isAnimationActive={false} />
        )}
      </ComposedChart>
    </ChartContainer>
  )
}
