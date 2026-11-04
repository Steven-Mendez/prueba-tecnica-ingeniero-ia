import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Term } from '@/components/Term'
import { cn } from '@/lib/utils'
import { signedNum } from '@/lib/format'

// Cambio frente a la referencia (valores por defecto): flecha de color y cifra en tinta de texto
export function Delta({ value, format = signedNum }: { value: number; format?: (v: number) => string }) {
  if (Math.abs(value) < 0.5) return null
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground tabular-nums">
      <Icon className={cn('size-3.5', up ? 'text-chart-1' : 'text-chart-3')} aria-hidden />
      {format(value)}
    </span>
  )
}

// Un indicador: etiqueta con ayuda, cifra héroe, cambio y detalle. Varios en una tarjeta forman la franja de KPI.
export function Stat({
  label,
  help,
  value,
  delta,
  detail,
  icon,
  className,
}: {
  className?: string
  label: string
  help?: ReactNode
  value: ReactNode
  delta?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1 px-5 py-4', className)}>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {help ? <Term help={help}>{label}</Term> : label}
      </span>
      {/* Cifra héroe: misma familia, sin tabular-nums */}
      <span className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight">
        {value}
        {delta}
      </span>
      {detail && <span className="text-xs leading-snug text-muted-foreground">{detail}</span>}
    </div>
  )
}
