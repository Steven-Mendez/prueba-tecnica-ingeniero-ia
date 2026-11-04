import { Term } from '@/components/Term'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { num0 } from '@/lib/format'
import { ScenarioChart } from '../charts/ScenarioChart'
import { ScenarioHeatmap } from '../sensitivity/ScenarioHeatmap'
import type { TabProps } from './props'

export default function SensitivityTab({ result, defaults }: TabProps) {
  const { sensitivity } = result
  const low = sensitivity.scenarios.find((s) => s.key === 'demand_minus_20')
  const high = sensitivity.scenarios.find((s) => s.key === 'demand_plus_20')
  const sensitive = sensitivity.most_sensitive_model

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <Term help={G.escenarios}>Total por escenario</Term>
          </CardTitle>
          <CardDescription>
            De {num0(sensitivity.total_min)} a {num0(sensitivity.total_max)} u.
            {sensitive && low && high && (
              <>
                {' '}
                · Más sensible: {sensitive}, de {num0(low.orders[sensitive])} a {num0(high.orders[sensitive])} u. con ±20 %
                de demanda
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScenarioChart scenarios={sensitivity.scenarios} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <Term help={G.heatmap}>Pedido por modelo en cada escenario</Term>
          </CardTitle>
          <CardDescription>En «Diferencia»: azul, más pedido; rojo, menos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScenarioHeatmap scenarios={sensitivity.scenarios} models={defaults.catalog.models} />
        </CardContent>
      </Card>
    </div>
  )
}
