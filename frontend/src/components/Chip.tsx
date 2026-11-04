import type { ReactNode } from 'react'

import { Help } from '@/components/Term'

// Dato corto con etiqueta (fechas del ciclo, día de la cola…) con ayuda opcional
export function Chip({ label, value, help }: { label: string; value: ReactNode; help?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
      {help && <Help className="ml-0.5">{help}</Help>}
    </span>
  )
}
