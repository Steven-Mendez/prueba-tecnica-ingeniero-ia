import { useState, type ComponentProps } from 'react'

import { Input } from '@/components/ui/input'

interface Props extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number | null
  onCommit: (value: number | null) => void
  min?: number
  max?: number
  // Vacío = null (p. ej. «sin pedido forzado»); si no, vaciar el campo no cambia el valor
  allowEmpty?: boolean
}

// Campo numérico que deja escribir libremente: mientras se escribe solo confirma valores dentro del rango
// (escribir «122» no pasa por 1 ni 12) y al salir del campo acota lo que haya quedado fuera.
export function NumberInput({ value, onCommit, min = -Infinity, max = Infinity, allowEmpty = false, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (text: string, final: boolean) => {
    if (text.trim() === '') {
      if (allowEmpty) onCommit(null)
      return
    }
    const n = Number(text)
    if (!Number.isFinite(n)) return
    if (n >= min && n <= max) onCommit(n)
    else if (final) onCommit(Math.min(max, Math.max(min, n)))
  }

  return (
    <Input
      {...props}
      type="number"
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      value={draft ?? (value == null ? '' : String(value))}
      onChange={(e) => {
        setDraft(e.target.value)
        commit(e.target.value, false)
      }}
      onBlur={(e) => {
        commit(e.target.value, true)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
