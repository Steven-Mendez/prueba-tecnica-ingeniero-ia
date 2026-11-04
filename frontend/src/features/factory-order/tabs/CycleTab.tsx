import { Badge } from '@/components/ui/badge'
import { Term } from '@/components/Term'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { date, num1, num2, pct, usd } from '@/lib/format'
import { CycleTimeline } from '../order/CycleTimeline'
import type { TabProps } from './props'

// Calendario del ciclo y economía por modelo: de dónde salen el hueco, el horizonte y el nivel de servicio
export default function CycleTab({ result }: TabProps) {
  const { calendar, derived } = result
  return (
    <div className="grid gap-4 @5xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Calendario del ciclo</CardTitle>
          <CardDescription>Lead time de {calendar.lead_time_days} días</CardDescription>
        </CardHeader>
        <CardContent>
          <CycleTimeline calendar={calendar} />
          <Table>
            <TableBody>
              {[
                ['Fecha de corte de los datos', date(calendar.cutoff_date), 'Última foto de inventario: todo se calcula con lo que se sabía ese día.'],
                ['Cierre de la ventana de pedido', date(calendar.window_close), 'Último día para enviar el pedido a fábrica.'],
                ['Llegada estimada del pedido', date(calendar.arrival), G.lead_time],
                ['Cierre de la ventana siguiente', date(calendar.next_window_close), 'La próxima oportunidad de pedir, un trimestre después.'],
                ['Llegada del pedido siguiente', date(calendar.next_arrival), 'Hasta ese día tiene que alcanzar lo que se pide ahora.'],
                ['Hueco que cubren stock + tránsito', `${num1(calendar.gap_months)} meses`, G.hueco],
                ['Horizonte que cubre el pedido', `${num1(calendar.horizon_months)} meses`, G.horizonte],
                [
                  'Factor estacional hueco / horizonte',
                  `${num2(calendar.gap_seasonal_factor)} / ${num2(calendar.horizon_seasonal_factor)}`,
                  G.factor_estacional,
                ],
              ].map(([k, v, help]) => (
                <TableRow key={k}>
                  <TableCell className="text-muted-foreground">
                    <Term help={help}>{k}</Term>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Valores que salen de los datos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {[
                  ['Lead time', `${derived.lead_time_days} días`, derived.sources.lead_time_days],
                  ['Llegadas tardías', pct(derived.late_share), derived.sources.late_share],
                  ['Lead time del comunicado', `${derived.communicated_lead_time_days} días`, derived.sources.communicated_lead_time_days],
                  [
                    'Fin de generación',
                    Object.keys(derived.end_of_life).join(', ') || 'Ninguno',
                    derived.sources.end_of_life,
                  ],
                ].map(([k, v, source]) => (
                  <TableRow key={k}>
                    <TableCell>
                      <div className="font-medium">{k}</div>
                      <div className="text-xs whitespace-normal text-muted-foreground">{source}</div>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">{v}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Economía por modelo</CardTitle>
            <CardDescription>Costo de faltar frente a costo de sobrar: de ahí sale el nivel de servicio de cada modelo</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[480px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right"><Term help={G.margen}>Margen / u.</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.costo_sobrar}>Costo de sobrar</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.nivel_servicio}>Nivel de servicio</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.z}>z</Term></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.economics.map((e) => (
                  <TableRow key={e.model}>
                    <TableCell className="font-medium">
                      {e.model}
                      {e.end_of_life_discount != null && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          liquidación {pct(e.end_of_life_discount)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(e.unit_margin_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(e.overstock_cost_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(e.service_level)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{num2(e.z)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
