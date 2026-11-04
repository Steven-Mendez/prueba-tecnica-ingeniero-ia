import { Eraser } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/NumberInput'
import { Label } from '@/components/ui/label'
import type { LotRule, ModelOverride, OrderRow } from '../types'

interface Props {
  row: OrderRow
  override: ModelOverride | undefined
  defaultRule: LotRule | undefined
  onChange: (patch: Partial<ModelOverride>) => void
  onClear: () => void
}

// Lo que los datos no saben (flotas comprometidas, lanzamientos, promociones, una regla negociada con fábrica)
export function ModelOverrides({ row, override, defaultRule, onChange, onClear }: Props) {
  const id = useId()
  const rule = override?.rule ?? defaultRule ?? { min_order: row.min_order, lot_multiple: row.lot_multiple }

  const setRule = (patch: Partial<LotRule>) => {
    const next = { ...rule, ...patch }
    const isDefault =
      defaultRule && next.min_order === defaultRule.min_order && next.lot_multiple === defaultRule.lot_multiple
    onChange({ rule: isDefault ? null : next })
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">Ajustes del planificador</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-adj`} className="text-xs">
            Ajuste manual (u.)
          </Label>
          <NumberInput
            id={`${id}-adj`}
            inputMode="numeric"
            step={1}
            min={-1000}
            max={1000}
            allowEmpty
            value={override?.manual_adjustment ?? 0}
            onCommit={(v) => onChange({ manual_adjustment: v == null ? 0 : Math.round(v) })}
            aria-describedby={`${id}-adj-help`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-forced`} className="text-xs">
            Cantidad fijada a mano
          </Label>
          <NumberInput
            id={`${id}-forced`}
            inputMode="numeric"
            min={0}
            max={5000}
            step={1}
            allowEmpty
            placeholder={`recomendado: ${row.computed_order}`}
            value={override?.forced_order ?? null}
            onCommit={(v) => onChange({ forced_order: v == null ? null : Math.round(v) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-min`} className="text-xs">
            Mínimo de fábrica
          </Label>
          <NumberInput
            id={`${id}-min`}
            inputMode="numeric"
            min={0}
            max={500}
            step={1}
            value={rule.min_order}
            onCommit={(v) => v != null && setRule({ min_order: Math.round(v) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-lot`} className="text-xs">
            Múltiplo del lote
          </Label>
          <NumberInput
            id={`${id}-lot`}
            inputMode="numeric"
            min={1}
            max={500}
            step={1}
            value={rule.lot_multiple}
            onCommit={(v) => v != null && setRule({ lot_multiple: Math.round(v) })}
          />
        </div>
      </div>
      <p id={`${id}-adj-help`} className="text-xs text-muted-foreground">
        Ajuste: se suma antes de redondear. Fijada a mano: reemplaza la recomendación (también se edita en la columna Pedido).
      </p>
      {override && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Eraser />
          Quitar ajustes de {row.model}
        </Button>
      )}
    </div>
  )
}
