import { Plus, RotateCcw, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { pct } from '@/lib/format'
import { Help } from './fields'

interface Props {
  value: Record<string, number> | null
  derived: Record<string, number>
  source: string | undefined
  models: string[]
  onChange: (value: Record<string, number> | null) => void
}

const DEFAULT_DISCOUNT = 0.1

// S1.10: modelos en su última ventana (sin seguridad, redondeo hacia abajo, descuento de liquidación)
export function EndOfLifeField({ value, derived, source, models, onChange }: Props) {
  const effective = value ?? derived
  const available = models.filter((m) => !(m in effective))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">Fin de generación</span>
        <Help>
          Modelos en su última ventana: horizonte hasta que llegue la nueva generación, sin stock de seguridad
          y redondeo hacia abajo. El porcentaje es el descuento de liquidación con que se venderá lo que sobre.
          {source && ` Auto: ${source.toLowerCase()}.`}
        </Help>
        <span className="ml-auto">
          {value === null ? (
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">auto</span>
          ) : (
            <Button variant="ghost" size="icon-xs" onClick={() => onChange(null)} aria-label="Volver a lo que dicen los comunicados">
              <RotateCcw />
            </Button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(effective).map(([model, discount]) => (
          <Badge key={model} variant="secondary" className="gap-1 pr-1">
            {model} · liquidación {pct(discount)}
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-foreground/10"
              aria-label={`Quitar ${model}`}
              onClick={() => {
                const next = { ...effective }
                delete next[model]
                onChange(next)
              }}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {Object.keys(effective).length === 0 && <span className="text-xs text-muted-foreground">Ninguno</span>}
        {available.length > 0 && (
          <Select value="" onValueChange={(m) => onChange({ ...effective, [m]: DEFAULT_DISCOUNT })}>
            <SelectTrigger size="sm" className="h-6 w-auto gap-1 px-2 text-xs" aria-label="Agregar modelo en fin de generación">
              <Plus className="size-3" />
              <SelectValue placeholder="Agregar" />
            </SelectTrigger>
            <SelectContent>
              {available.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
