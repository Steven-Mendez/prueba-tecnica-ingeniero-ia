import { CalendarDays } from 'lucide-react'
import type { Dispatch } from 'react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { date, windowLabel } from '@/lib/format'
import type { ParametersAction } from '../parameters/state'
import type { CutoffOption, DerivedParameters, Parameters, WindowKind } from '../types'

export const KIND_LABEL: Record<WindowKind, string> = {
  current: 'Ventana actual',
  future: 'Próxima ventana',
  past: 'Ventana ya cerrada · solo para comparar',
}

// Solo se ofrecen ventanas en las que todavía se puede pedir. Una ventana ya cerrada solo aparece si se abrió un
// plan guardado de esa ventana desde Seguimiento.
const GROUPS: { kind: WindowKind; title: string }[] = [
  { kind: 'current', title: 'Ventana actual' },
  { kind: 'future', title: 'Próximas ventanas · con los datos de hoy' },
  { kind: 'past', title: 'Ventana ya cerrada' },
]

// La ventana que se está planificando: la que corresponde a la fecha de corte y al cierre elegidos
export function selectedWindow(options: CutoffOption[], p: Parameters, derived: DerivedParameters): CutoffOption | null {
  const cutoff = p.cutoff_date ?? options.find((o) => o.kind === 'current')?.cutoff_date ?? derived.cutoff_date
  const close = p.window_close ?? derived.window_close
  return options.find((o) => o.cutoff_date === cutoff && o.window_close === close) ?? null
}

interface Props {
  options: CutoffOption[]
  parameters: Parameters
  derived: DerivedParameters
  dispatch: Dispatch<ParametersAction>
}

// Selector de la ventana a planificar: la actual, las siguientes (los planes guardados intermedios cuentan como
// tránsito) o una pasada, que se recalcula solo con lo que se sabía entonces.
export function WindowSelect({ options, parameters: p, derived, dispatch }: Props) {
  const selected = selectedWindow(options, p, derived)
  const key = (o: CutoffOption) => `${o.cutoff_date}|${o.window_close}`
  const choose = (value: string) => {
    const o = options.find((x) => key(x) === value)
    if (!o) return
    dispatch({
      type: 'setCutoff',
      cutoff: o.kind === 'past' ? o.cutoff_date : null,
      window: o.kind === 'future' ? o.window_close : null,
    })
  }

  return (
    <Select value={selected ? key(selected) : ''} onValueChange={choose}>
      <SelectTrigger className="h-9 min-w-56 gap-2" aria-label="Ventana a planificar" data-tour="window">
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        <SelectValue placeholder={`Cierre ${date(p.window_close ?? derived.window_close)} · personalizada`} />
      </SelectTrigger>
      <SelectContent>
        {GROUPS.map((g) => {
          const items = options.filter((o) => o.kind === g.kind && (g.kind !== 'past' || o === selected))
          if (items.length === 0) return null
          return (
            <SelectGroup key={g.kind}>
              <SelectLabel>{g.title}</SelectLabel>
              {items.map((o) => (
                <SelectItem key={key(o)} value={key(o)}>
                  <span className="font-medium">Ventana {windowLabel(o.window_close)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · cierra {date(o.window_close)}
                    {o.kind === 'past' && ` · datos al ${date(o.cutoff_date)}`}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}
