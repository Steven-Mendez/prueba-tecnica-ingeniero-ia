import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Term } from '@/components/Term'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { num0, num1 } from '@/lib/format'
import { Legend } from '../charts/ChartTip'
import { COLORS } from '../charts/config'
import { VersionChart } from '../charts/VersionChart'
import type { TabProps } from './props'

export default function VersionsTab({ result }: TabProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const models = result.order.filter((r) => r.order > 0).map((r) => r.model)
  const byModel = (m: string) => result.versions.filter((v) => v.model === m)
  const covered = (m: string) => result.covered_versions.filter((v) => v.model === m)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Term help="Cómo se reparte el pedido de cada modelo entre sus versiones, en proporción a lo que falta de cada una.">Mezcla por versión</Term>
        </CardTitle>
        <CardAction>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={view}
            onValueChange={(v) => v && setView(v as 'chart' | 'table')}
            aria-label="Vista"
          >
            <ToggleGroupItem value="chart">Gráfico</ToggleGroupItem>
            <ToggleGroupItem value="table">Tabla</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {models.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Sin pedido</EmptyTitle>
              <EmptyDescription>Ningún modelo lleva pedido.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === 'chart' ? (
          <>
            <Legend
              items={[
                { label: 'Faltante hasta fin del horizonte', color: COLORS.reference },
                { label: 'Pedido', color: COLORS.primary },
              ]}
            />
            <div className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
              {models.map((m) => {
                const total = result.order.find((r) => r.model === m)?.order ?? 0
                const zero = covered(m)
                return (
                  <div key={m} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{m}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{total} u.</span>
                    </div>
                    <VersionChart rows={byModel(m)} />
                    {zero.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {zero.map((v) => (
                          <Badge key={v.version} variant="outline" className="text-[10px]">
                            {v.version}: cubierta por {num0(v.stock_at_cutoff)} en patio
                            {v.in_transit ? ` + ${num0(v.in_transit)} en tránsito` : ''} ({num1(v.monthly_demand)}/mes)
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead className="text-right"><Term help={G.demanda_version}>Demanda 12 m</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.stock_version}>Stock</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.transito_version}>Tránsito</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.necesidad}>Necesidad</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.faltante}>Faltante</Term></TableHead>
                  <TableHead className="text-right"><Term help={G.pedido_version}>Pedido</Term></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.versions.map((v) => (
                  <TableRow key={`${v.model}-${v.version}`}>
                    <TableCell className="font-medium">{v.model}</TableCell>
                    <TableCell>{v.version}</TableCell>
                    <TableCell className="text-right tabular-nums">{num0(v.demand_window)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num0(v.stock_at_cutoff)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num0(v.in_transit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num1(v.need_until_horizon_end)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num1(v.shortfall)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{v.order}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
