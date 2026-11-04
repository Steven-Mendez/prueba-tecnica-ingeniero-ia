import type { ReactNode } from 'react'

import type { ChartConfig } from '@/components/ui/chart'

export interface TipItem {
  dataKey?: unknown
  name?: unknown
  value?: unknown
  color?: string
  type?: string
  payload?: Record<string, unknown>
}

interface ChartTipProps {
  active?: boolean
  payload?: ReadonlyArray<TipItem>
  label?: unknown
  config: ChartConfig
  title?: (label: unknown, row: Record<string, unknown> | undefined) => ReactNode
  format?: (value: number, key: string) => string
  footer?: (row: Record<string, unknown> | undefined) => ReactNode
  hide?: string[]
}

// Tooltip de los gráficos: etiqueta de la serie (del ChartConfig), muestra de color y valor con formato es-NI.
// Recharts le pasa active/payload/label al clonar el elemento.
export function ChartTip({ active, payload, label, config, title, format, footer, hide = [] }: ChartTipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  const items = payload.filter((p) => p.type !== 'none' && !hide.includes(String(p.dataKey)))
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
      <div className="font-medium">{title ? title(label, row) : String(label ?? '')}</div>
      <div className="grid gap-1">
        {items.map((item) => {
          const key = String(item.dataKey ?? item.name)
          const value = typeof item.value === 'number' ? item.value : Number(item.value)
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: config[key]?.color ?? item.color }}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">{config[key]?.label ?? String(item.name)}</span>
              <span className="font-mono font-medium tabular-nums">
                {Number.isFinite(value) ? (format ? format(value, key) : value.toLocaleString('es-NI')) : '—'}
              </span>
            </div>
          )
        })}
      </div>
      {footer?.(row)}
    </div>
  )
}

// Leyenda en HTML (para gráficos pequeños o múltiplos que comparten una sola leyenda)
export function Legend({ items }: { items: { label: ReactNode; color: string; shape?: 'square' | 'dot' | 'line' | 'band' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {item.shape === 'line' ? (
            <span className="h-0.5 w-4 rounded-full" style={{ background: item.color }} aria-hidden />
          ) : item.shape === 'dot' ? (
            <span className="size-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
          ) : item.shape === 'band' ? (
            <span className="h-3 w-3 rounded-[2px] opacity-30" style={{ background: item.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} aria-hidden />
          )}
          {item.label}
        </span>
      ))}
    </div>
  )
}
