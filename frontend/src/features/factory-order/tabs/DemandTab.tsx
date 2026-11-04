import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Term } from '@/components/Term'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { num0, num1, signedNum, signedPct } from '@/lib/format'
import { Legend } from '../charts/ChartTip'
import { COLORS } from '../charts/config'
import { ModelHistoryChart } from '../charts/ModelHistoryChart'
import { SeasonalityChart } from '../charts/SeasonalityChart'
import type { TabProps } from './props'

export default function DemandTab({ result, parameters }: TabProps) {
  const [filter, setFilter] = useState<'stockout' | 'all'>('stockout')
  const [showStock, setShowStock] = useState(false)
  const withStockouts = result.history.filter((h) => h.stockout_months > 0)
  const shown = filter === 'stockout' && withStockouts.length > 0 ? withStockouts : result.history
  const window = parameters.demand_window_months
  const hasReturned = shown.some((h) => h.points.some((p) => p.sales > p.adjusted_demand))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <Term help={G.demanda_ajustada}>Venta y demanda recuperada</Term>
          </CardTitle>
          <CardDescription>Últimos 18 meses · venta más leads perdidos y sustituciones en los meses sin stock</CardDescription>
          <CardAction>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={filter}
              onValueChange={(v) => v && setFilter(v as 'stockout' | 'all')}
              aria-label="Modelos a mostrar"
            >
              <ToggleGroupItem value="stockout">Con quiebres ({withStockouts.length})</ToggleGroupItem>
              <ToggleGroupItem value="all">Todos</ToggleGroupItem>
            </ToggleGroup>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Legend
              items={[
                { label: 'Venta propia', color: COLORS.primary },
                { label: 'Demanda recuperada', color: COLORS.recovered },
                ...(hasReturned ? [{ label: 'Venta a clientes de otro modelo', color: COLORS.reference }] : []),
                { label: 'Mes en quiebre', color: COLORS.risk, shape: 'band' as const },
                ...(showStock ? [{ label: 'Stock a fin de mes', color: COLORS.ink, shape: 'line' as const }] : []),
              ]}
            />
            <div className="flex items-center gap-2">
              <Switch id="show-stock" checked={showStock} onCheckedChange={setShowStock} size="sm" />
              <Label htmlFor="show-stock" className="text-xs">
                Stock a fin de mes
              </Label>
            </div>
          </div>
          <div className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
            {shown.map((h) => (
              <div key={h.model} className="rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{h.model}</span>
                  {h.stockout_months > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {h.stockout_months} {h.stockout_months === 1 ? 'mes' : 'meses'} en quiebre
                    </Badge>
                  )}
                  {h.adjustment_vs_sales != null && Math.abs(h.adjustment_vs_sales) >= 0.02 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {signedPct(h.adjustment_vs_sales)} vs venta
                    </Badge>
                  )}
                </div>
                <ModelHistoryChart history={h} showStock={showStock} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demanda ajustada por modelo</CardTitle>
          <CardDescription>Últimos {window} meses</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right"><Term help={G.venta}>Venta</Term></TableHead>
                <TableHead className="text-right"><Term help={G.meses_quiebre}>Meses en quiebre</Term></TableHead>
                <TableHead className="text-right"><Term help={G.perdidas_recuperables}>Pérdidas recuperables</Term></TableHead>
                <TableHead className="text-right"><Term help={G.sustitucion_neta}>Sustitución neta</Term></TableHead>
                <TableHead className="text-right"><Term help={G.demanda_ajustada}>Demanda ajustada</Term></TableHead>
                <TableHead className="text-right"><Term help={G.demanda_mensual}>Mensual</Term></TableHead>
                <TableHead className="text-right"><Term help={G.desviacion}>Desv.</Term></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.demand.map((d) => (
                <TableRow key={d.model}>
                  <TableCell className="font-medium">{d.model}</TableCell>
                  <TableCell className="text-right tabular-nums">{num0(d.sales_window)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.stockout_months || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{num0(d.recoverable_lost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{signedNum(d.net_substitution)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{num0(d.adjusted_demand_window)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num1(d.monthly_demand)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{num1(d.monthly_std)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Term help={G.estacionalidad}>Estacionalidad</Term>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SeasonalityChart points={result.seasonality} calendar={result.calendar} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Term help={G.sustituciones}>Sustituciones en meses de quiebre</Term>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.substitutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin sustituciones.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buscaba</TableHead>
                    <TableHead>Compró</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.substitutions.map((s) => (
                    <TableRow key={`${s.wanted_model}-${s.bought_model}`}>
                      <TableCell>{s.wanted_model}</TableCell>
                      <TableCell>{s.bought_model}</TableCell>
                      <TableCell className="text-right tabular-nums">{num0(s.units)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
