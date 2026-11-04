import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'

import { DateRangePicker } from '@/components/DatePicker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fetchSheet as fetchCaso1Sheet } from '@/lib/api'
import { date, num0, num2, usd } from '@/lib/format'
import { useApi } from '@/hooks/useApi'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { Column, SheetFetcher, SheetInfo, SheetPage, SheetQuery } from './types'

const ALL = '__all__'
const ALL_LABEL: Record<string, string> = { Modelo: 'Todos los modelos', Gestor: 'Todos los gestores' }

function Cell({ column, value }: { column: Column; value: unknown }) {
  if (value == null || value === '') return <span className="text-muted-foreground/60">—</span>
  switch (column.type) {
    case 'bool':
      return value ? <Check className="ml-auto size-4 text-chart-1" aria-label="sí" /> : <span className="text-muted-foreground/60">·</span>
    case 'date':
      return <>{date(String(value))}</>
    case 'money':
      return <>{usd(Number(value))}</>
    case 'number': {
      const n = Number(value)
      return <>{Number.isInteger(n) ? num0(n) : num2(n)}</>
    }
    default:
      return (
        <span className="block max-w-72 truncate" title={String(value)}>
          {String(value)}
        </span>
      )
  }
}

export function SheetExplorer({ info, version, fetchSheet = fetchCaso1Sheet }: { info: SheetInfo; version: string | null; fetchSheet?: SheetFetcher }) {
  const [query, setQuery] = useState<SheetQuery>({
    page: 1,
    page_size: 50,
    q: '',
    model: null,
    date_from: null,
    date_to: null,
    flag: null,
    sort: null,
    desc: false,
  })
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search, 300)
  const effective = { ...query, q }
  const { data, loading, error } = useApi<SheetPage>(
    version ? `sheet:${version}:${info.key}:${JSON.stringify(effective)}` : null,
    (signal) => fetchSheet(info.key, effective, signal),
  )
  const set = (patch: Partial<SheetQuery>) => setQuery((cur) => ({ ...cur, page: 1, ...patch }))

  const flags = data?.columns.filter((c) => c.derived && c.type === 'bool') ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const from = data && data.total ? (data.page - 1) * data.page_size + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.page_size) : 0

  const sortBy = (key: string) =>
    setQuery((cur) => ({
      ...cur,
      page: 1,
      sort: cur.sort === key && cur.desc ? null : key,
      desc: cur.sort === key ? !cur.desc : false,
    }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{info.label}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{info.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary">Hoja «{info.sheet}»</Badge>
          <Badge variant="secondary">{num0(info.clean_rows)} filas</Badge>
          {info.date_from && info.date_to && (
            <Badge variant="secondary">
              {date(info.date_from)} – {date(info.date_to)}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <InputGroup className="min-w-52 flex-1 sm:max-w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Buscar en la hoja…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setQuery((cur) => ({ ...cur, page: 1 }))
            }}
            aria-label="Buscar"
          />
        </InputGroup>
        {data?.model_column && (
          <Select value={query.model ?? ALL} onValueChange={(v) => set({ model: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label={data.filter_label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{ALL_LABEL[data.filter_label] ?? `Todos (${data.filter_label.toLowerCase()})`}</SelectItem>
              {data.models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {data?.date_column && (
          <DateRangePicker
            size="default"
            from={query.date_from}
            to={query.date_to}
            min={info.date_from}
            max={info.date_to}
            onChange={(date_from, date_to) => set({ date_from, date_to })}
          />
        )}
        {flags.length > 0 && (
          <Select value={query.flag ?? ALL} onValueChange={(v) => set({ flag: v === ALL ? null : v })}>
            <SelectTrigger className="w-52" aria-label="Marca de la limpieza">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las filas</SelectItem>
              {flags.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  Solo: {f.label.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <CardContent className={cn('p-0 transition-opacity', loading && data && 'opacity-60')}>
          {!data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : (
            <div className="max-h-[calc(100svh-22rem)] min-h-64 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
                  <TableRow>
                    {data.columns.map((c) => {
                      const active = query.sort === c.key
                      const Icon = active ? (query.desc ? ArrowDown : ArrowUp) : ArrowUpDown
                      const right = c.type !== 'text' && c.type !== 'date'
                      return (
                        <TableHead key={c.key} className={cn('whitespace-nowrap', c.derived && 'bg-chart-1/5', right && 'text-right')}>
                          <button
                            type="button"
                            onClick={() => sortBy(c.key)}
                            className={cn('inline-flex items-center gap-1 hover:text-foreground', right && 'flex-row-reverse')}
                            aria-label={`Ordenar por ${c.label}`}
                          >
                            {c.label}
                            <Icon className={cn('size-3', active ? 'text-foreground' : 'text-muted-foreground/50')} />
                          </button>
                          {c.derived && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-1 rounded bg-chart-1/15 px-1 text-[10px] font-normal text-chart-1">limpieza</span>
                              </TooltipTrigger>
                              <TooltipContent>Columna que agrega la limpieza; no está en el Excel</TooltipContent>
                            </Tooltip>
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={data.columns.length} className="py-10 text-center text-muted-foreground">
                        Ninguna fila coincide con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.rows.map((row, i) => (
                      <TableRow key={i}>
                        {data.columns.map((c, j) => (
                          <TableCell
                            key={c.key}
                            className={cn(
                              'tabular-nums',
                              c.type !== 'text' && c.type !== 'date' && 'text-right',
                              c.derived && 'bg-chart-1/5',
                            )}
                          >
                            <Cell column={c} value={row[j]} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {data && (
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {num0(from)}–{num0(to)} de {num0(data.total)} filas
            </span>
            <Select value={String(query.page_size)} onValueChange={(v) => set({ page_size: Number(v) })}>
              <SelectTrigger size="sm" className="h-7 w-28" aria-label="Filas por página">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 250].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} por página
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={data.page <= 1}
                onClick={() => setQuery((cur) => ({ ...cur, page: cur.page - 1 }))}
                aria-label="Página anterior"
              >
                <ChevronLeft />
              </Button>
              <span className="px-2 tabular-nums">
                {data.page} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={data.page >= pages}
                onClick={() => setQuery((cur) => ({ ...cur, page: cur.page + 1 }))}
                aria-label="Página siguiente"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
