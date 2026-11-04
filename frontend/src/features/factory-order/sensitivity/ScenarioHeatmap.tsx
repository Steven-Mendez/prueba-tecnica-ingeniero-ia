import { useState } from 'react'

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { num0, signedNum } from '@/lib/format'
import type { Scenario } from '../types'

type Mode = 'units' | 'diff'

// Secuencial (un solo tono, de claro a oscuro) para unidades; divergente rojo/azul con punto medio neutro para
// la diferencia frente al pedido actual
function cellStyle(mode: Mode, value: number, max: number): React.CSSProperties {
  if (mode === 'units') {
    if (value <= 0) return {}
    const p = 12 + 80 * (value / max)
    return {
      background: `color-mix(in oklab, var(--chart-1) ${p}%, var(--card))`,
      color: p > 55 ? 'white' : undefined,
    }
  }
  if (value === 0) return {}
  const p = 15 + 70 * Math.min(1, Math.abs(value) / max)
  const hue = value > 0 ? 'var(--chart-1)' : 'var(--chart-3)'
  return { background: `color-mix(in oklab, ${hue} ${p}%, var(--card))`, color: p > 55 ? 'white' : undefined }
}

export function ScenarioHeatmap({ scenarios, models }: { scenarios: Scenario[]; models: string[] }) {
  const [mode, setMode] = useState<Mode>('units')
  const current = scenarios.find((s) => s.key === 'current') ?? scenarios[0]
  const value = (s: Scenario, m: string) => (mode === 'units' ? s.orders[m] : s.orders[m] - current.orders[m])
  const max = Math.max(1, ...scenarios.flatMap((s) => models.map((m) => Math.abs(value(s, m)))))
  const order = [...models].sort((a, b) => current.orders[b] - current.orders[a])

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={mode}
        onValueChange={(v) => v && setMode(v as Mode)}
        aria-label="Valores del mapa"
      >
        <ToggleGroupItem value="units">Unidades</ToggleGroupItem>
        <ToggleGroupItem value="diff">Diferencia vs actual</ToggleGroupItem>
      </ToggleGroup>
      <div className="overflow-x-auto">
        <Table className="min-w-[860px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-card">Modelo</TableHead>
              {scenarios.map((s) => (
                <TableHead key={s.key} className="max-w-28 text-right align-bottom whitespace-normal">
                  <Tooltip>
                    <TooltipTrigger className="text-right">{s.name}</TooltipTrigger>
                    <TooltipContent className="max-w-64">{s.description}</TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.map((m) => (
              <TableRow key={m} className="hover:bg-transparent">
                <TableCell className="sticky left-0 z-10 bg-card font-medium">{m}</TableCell>
                {scenarios.map((s) => {
                  const v = value(s, m)
                  return (
                    <TableCell
                      key={s.key}
                      className="text-right tabular-nums"
                      style={cellStyle(mode, v, max)}
                    >
                      {mode === 'units' ? num0(v) : v === 0 ? '·' : signedNum(v)}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="sticky left-0 z-10 bg-muted">Total</TableCell>
              {scenarios.map((s) => (
                <TableCell key={s.key} className="text-right tabular-nums font-semibold">
                  {mode === 'units' ? num0(s.total_units) : signedNum(s.total_units - current.total_units)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}
