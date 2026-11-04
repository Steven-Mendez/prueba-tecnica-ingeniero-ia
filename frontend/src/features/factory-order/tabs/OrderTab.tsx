import { Term } from '@/components/Term'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { date, num0, usdCompact } from '@/lib/format'
import { CoverageChart } from '../charts/CoverageChart'
import { OrderChart } from '../charts/OrderChart'
import { ExportButtons } from '../order/ExportButtons'
import { HistoricalCheck } from '../order/HistoricalCheck'
import { ImpactSummary } from '../order/ImpactSummary'
import { Kpis } from '../order/Kpis'
import { OrderTable } from '../order/OrderTable'
import type { TabProps } from './props'

// Cabecera de gráfico con la cifra que lo resume arriba (como los reportes de Stripe o HoneyBook)
function ChartHeader({ title, help, figure, unit, description }: { title: string; help: string; figure: string; unit: string; description?: string }) {
  return (
    <CardHeader>
      <CardDescription className="text-sm font-medium text-foreground">
        <Term help={help}>{title}</Term>
      </CardDescription>
      <CardTitle className="flex flex-wrap items-baseline gap-x-1.5 text-2xl font-semibold tracking-tight">
        <span className="whitespace-nowrap">{figure}</span>
        <span className="text-sm font-normal text-muted-foreground">{unit}</span>
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
  )
}

export default function OrderTab({ result, parameters, defaults, changes, dispatch }: TabProps) {
  const { calendar, kpis } = result
  const runOut = result.order.filter((r) => (r.coverage_today_months ?? Infinity) < calendar.gap_months).length

  return (
    <div className="space-y-4">
      <ImpactSummary result={result} changes={changes} onReset={() => dispatch({ type: 'reset' })} />
      <HistoricalCheck result={result} />
      <div data-tour="kpis">
        <Kpis result={result} />
      </div>

      <div className="grid gap-4 @5xl:grid-cols-5">
        <Card className="@5xl:col-span-3" data-tour="order-chart">
          <ChartHeader
            title="Qué cubre el pedido"
            help={G.grafico_pedido}
            figure={num0(kpis.total_units)}
            unit={`unidades · ${usdCompact(kpis.capital_usd)}`}
            description={`Llegada ${date(calendar.arrival)} · horizonte ${calendar.horizon_label}`}
          />
          <CardContent>
            <OrderChart rows={result.order} calendar={calendar} />
          </CardContent>
        </Card>
        <Card className="@5xl:col-span-2">
          <ChartHeader
            title="Meses de cobertura"
            help={G.grafico_cobertura}
            figure={`${runOut} de ${kpis.models_total}`}
            unit="modelos se agotan antes de la llegada"
          />
          <CardContent>
            <CoverageChart rows={result.order} calendar={calendar} />
          </CardContent>
        </Card>
      </div>

      <Card data-tour="order-table" id="order-table" className="scroll-mt-16">
        <CardHeader>
          <CardTitle>
            <Term help="Abre una fila para ver cómo se llega a su pedido paso a paso y ajustarlo a mano.">Pedido por modelo</Term>
          </CardTitle>
          <CardAction data-tour="export">
            <ExportButtons parameters={parameters} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <OrderTable
            result={result}
            parameters={parameters}
            catalog={defaults.catalog}
            onOverride={(model, patch) => dispatch({ type: 'setOverride', model, patch })}
            onClearOverride={(model) => dispatch({ type: 'clearOverride', model })}
          />
        </CardContent>
      </Card>
    </div>
  )
}
