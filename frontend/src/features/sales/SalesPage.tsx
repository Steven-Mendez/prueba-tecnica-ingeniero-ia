import { AlertCircle, ArrowDownRight, ArrowUpRight, FilterX } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { DateRangePicker } from '@/components/DatePicker'
import { MultiSelect } from '@/components/MultiSelect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Term } from '@/components/Term'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { G } from '@/lib/glossary'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { fetchSales } from '@/lib/api'
import { date, num0, pct, signedPct, usd, usdCompact } from '@/lib/format'
import { useApi } from '@/hooks/useApi'
import { PageHeader } from '@/features/app/PageHeader'
import { GroupBarChart, MonthlySalesChart } from './SalesCharts'
import type { SalesGroup, SalesOverview, SalesQuery } from './types'

const EMPTY: SalesQuery = {
  date_from: null,
  date_to: null,
  models: [],
  branches: [],
  customer_types: [],
  include_fleet: false,
}
const PERIODS = [
  { value: '3', label: '3 m' },
  { value: '6', label: '6 m' },
  { value: '12', label: '12 m' },
  { value: '24', label: '24 m' },
  { value: 'all', label: 'Todo' },
]

function monthsBack(maxDate: string, months: number): string {
  const d = new Date(`${maxDate}T00:00:00`)
  d.setMonth(d.getMonth() - months)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function Change({ value, previous }: { value: number; previous: number | null }) {
  if (previous == null || previous === 0) return null
  const change = value / previous - 1
  const up = change > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground tabular-nums">
      <Icon className={cn('size-3.5', up ? 'text-chart-1' : 'text-chart-3')} aria-hidden />
      {signedPct(change)}
    </span>
  )
}

function Stat({ label, help, value, delta, detail, className }: { label: string; help: ReactNode; value: ReactNode; delta?: ReactNode; detail?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 px-5 py-4', className)}>
      <span className="text-sm text-muted-foreground">
        <Term help={help}>{label}</Term>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight">
        {value}
        {delta}
      </span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
}

function RankTable({ groups, label }: { groups: SalesGroup[]; label: string }) {
  const max = Math.max(1, ...groups.map((g) => g.units))
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="w-40" />
          <TableHead className="text-right">Unidades</TableHead>
          <TableHead className="text-right"><Term help={G.vs_anio_anterior}>vs año ant.</Term></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <TableRow key={g.key}>
            <TableCell className="max-w-64 truncate" title={g.label}>
              {g.label}
            </TableCell>
            <TableCell>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${(g.units / max) * 100}%` }} />
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{num0(g.units)}</TableCell>
            <TableCell className="text-right">
              <Change value={g.units} previous={g.units_prev_year} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function SalesPage({ version }: { version: string | null }) {
  const [query, setQuery] = useState<SalesQuery>(EMPTY)
  const [period, setPeriod] = useState('12')
  const [showPrevYear, setShowPrevYear] = useState(true)
  const { data, loading, error } = useApi<SalesOverview>(
    version ? `sales:${version}:${JSON.stringify(query)}` : null,
    (signal) => fetchSales(query, signal),
  )
  const set = (patch: Partial<SalesQuery>) => setQuery((q) => ({ ...q, ...patch }))
  const filtered = JSON.stringify(query) !== JSON.stringify(EMPTY)

  const choosePeriod = (value: string) => {
    if (!value || !data) return
    setPeriod(value)
    const { min_date, max_date } = data.options
    set(
      value === 'all'
        ? { date_from: min_date, date_to: max_date }
        : value === '12'
          ? { date_from: null, date_to: null }
          : { date_from: monthsBack(max_date, Number(value)), date_to: max_date },
    )
  }

  const k = data?.kpis
  const lostShare = k && k.units > 0 ? k.lost_units / k.units : null

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Análisis' }, { label: 'Ventas' }]}
        actions={
          filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery(EMPTY)
                setPeriod('12')
              }}
            >
              <FilterX />
              Quitar filtros
            </Button>
          )
        }
      />
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          {data && <p className="text-sm text-muted-foreground">Datos al {date(data.options.max_date)}</p>}
        </div>

        {/* Una fila de filtros que gobierna toda la página */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={period} onValueChange={choosePeriod} aria-label="Periodo">
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p.value} value={p.value} className="px-2.5">
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DateRangePicker
            from={query.date_from ?? data?.filters.date_from ?? null}
            to={query.date_to ?? data?.filters.date_to ?? null}
            min={data?.options.min_date}
            max={data?.options.max_date}
            onChange={(date_from, date_to) => {
              setPeriod(date_from || date_to ? '' : '12')
              set({ date_from, date_to })
            }}
          />
          {data && (
            <>
              <MultiSelect label="Modelos" options={data.options.models} value={query.models} onChange={(models) => set({ models })} />
              <MultiSelect label="Sucursales" options={data.options.branches} value={query.branches} onChange={(branches) => set({ branches })} />
              <MultiSelect
                label="Cliente"
                options={data.options.customer_types}
                value={query.customer_types}
                onChange={(customer_types) => set({ customer_types })}
              />
            </>
          )}
          <div className="ml-auto flex items-center gap-2 px-1">
            <Switch id="fleet" size="sm" checked={query.include_fleet} onCheckedChange={(include_fleet) => set({ include_fleet })} />
            <Label htmlFor="fleet" className="text-xs">
              Incluir flotas especiales
            </Label>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!data ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : (
          <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            <Card className="gap-0 py-0" data-tour="sales-kpis">
              <div className="grid sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Unidades netas"
                  help={G.unidades_netas}
                  value={num0(k!.units)}
                  delta={<Change value={k!.units} previous={k!.units_prev_year} />}
                  detail={k!.units_prev_year != null ? `Año anterior: ${num0(k!.units_prev_year)}` : 'Sin datos del año anterior'}
                />
                <Stat
                  className="border-t sm:border-t-0 sm:border-l"
                  label="Ingresos"
                  help={G.ingresos}
                  value={usdCompact(k!.revenue_usd)}
                  delta={<Change value={k!.revenue_usd} previous={k!.revenue_prev_year} />}
                  detail={usd(k!.revenue_usd)}
                />
                <Stat
                  className="border-t xl:border-t-0 xl:border-l"
                  label="Precio promedio"
                  help={G.precio_promedio}
                  value={usdCompact(k!.avg_price_usd)}
                  detail={`${num0(k!.invoices)} facturas · ${num0(k!.credit_notes)} notas de crédito`}
                />
                <Stat
                  className="border-t sm:border-l xl:border-t-0"
                  label="Venta perdida por disponibilidad"
                  help={G.venta_perdida}
                  value={`${num0(k!.lost_units)} u.`}
                  detail={`${lostShare != null ? pct(lostShare) : '—'} de la venta · flotas especiales: ${num0(k!.fleet_units)} u.`}
                />
              </div>
            </Card>

            <Card data-tour="sales-monthly">
              <CardHeader>
                <CardTitle>Venta por mes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch id="prev-year" size="sm" checked={showPrevYear} onCheckedChange={setShowPrevYear} />
                  <Label htmlFor="prev-year" className="text-xs">
                    Comparar con el año anterior
                  </Label>
                </div>
                <MonthlySalesChart months={data.monthly} showPrevYear={showPrevYear} />
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Por modelo</CardTitle>
                </CardHeader>
                <CardContent>
                  <GroupBarChart groups={data.by_model} />
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Por sucursal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <GroupBarChart groups={data.by_branch} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Por tipo de cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <GroupBarChart groups={data.by_customer_type} />
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Versiones más vendidas</CardTitle>
                </CardHeader>
                <CardContent>
                  <RankTable groups={data.top_versions} label="Modelo · versión" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Vendedores</CardTitle>
                </CardHeader>
                <CardContent>
                  <RankTable groups={data.top_sellers} label="Vendedor · sucursal" />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
