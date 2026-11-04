import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { es } from 'react-day-picker/locale'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { date } from '@/lib/format'
import { cn } from '@/lib/utils'

// Selectores de fecha de shadcn (Popover + Calendar). La API trabaja con fechas ISO 'YYYY-MM-DD'; se convierten
// en hora local para que el día no se corra por la zona horaria.

function fromIso(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Bounds {
  min?: string | null
  max?: string | null
  weekdaysOnly?: boolean // solo días hábiles (lunes a viernes)
}

function boundsProps({ min, max, weekdaysOnly }: Bounds) {
  const start = fromIso(min)
  const end = fromIso(max)
  return {
    startMonth: start,
    endMonth: end,
    disabled: [
      ...(start ? [{ before: start }] : []),
      ...(end ? [{ after: end }] : []),
      ...(weekdaysOnly ? [{ dayOfWeek: [0, 6] }] : []),
    ],
  }
}

interface DatePickerProps extends Bounds {
  value: string | null
  onChange: (iso: string) => void
  id?: string
  className?: string
  'aria-label'?: string
}

export function DatePicker({ value, onChange, min, max, weekdaysOnly, id, className, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = fromIso(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          aria-label={rest['aria-label']}
          className={cn('justify-start font-normal', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="text-muted-foreground" />
          {value ? date(value) : 'Elegir fecha'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return
            onChange(toIso(d))
            setOpen(false)
          }}
          {...boundsProps({ min, max, weekdaysOnly })}
        />
      </PopoverContent>
    </Popover>
  )
}

interface DateRangePickerProps extends Bounds {
  from: string | null
  to: string | null
  onChange: (from: string | null, to: string | null) => void
  placeholder?: string
  size?: 'sm' | 'default'
  className?: string
}

// Rango en dos clics: el primero fija el inicio, el segundo el fin (en cualquier orden) y cierra.
export function DateRangePicker({
  from,
  to,
  onChange,
  min,
  max,
  placeholder = 'Todas las fechas',
  size = 'sm',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const wide = useMediaQuery('(min-width: 768px)')
  const value: DateRange | undefined = from || to ? { from: fromIso(from), to: fromIso(to) } : undefined
  const label = from && to ? `${date(from)} – ${date(to)}` : from ? `Desde ${date(from)}` : to ? `Hasta ${date(to)}` : placeholder

  const pick = (day: Date) => {
    if (!draft?.from || draft.to) {
      setDraft({ from: day, to: undefined })
      return
    }
    const [a, b] = day < draft.from ? [day, draft.from] : [draft.from, day]
    setDraft({ from: a, to: b })
    onChange(toIso(a), toIso(b))
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(value)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={cn('justify-start font-normal', !from && !to && 'text-muted-foreground', className)}
          aria-label="Rango de fechas"
        >
          <CalendarIcon className="text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={es}
          captionLayout="dropdown"
          numberOfMonths={wide ? 2 : 1}
          selected={draft}
          defaultMonth={draft?.from ?? fromIso(max)}
          onSelect={(_, day) => pick(day)}
          {...boundsProps({ min, max })}
        />
        {(from || to) && (
          <div className="flex justify-end border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null, null)
                setOpen(false)
              }}
            >
              Quitar fechas
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
