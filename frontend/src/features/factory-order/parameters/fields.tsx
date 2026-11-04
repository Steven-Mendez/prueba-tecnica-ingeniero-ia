import { RotateCcw } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/NumberInput'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Help } from '@/components/Term'

export { Help }

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  // La entrada muestra value × scale (p. ej. 100 para porcentajes) con `unit`
  scale?: number
  unit?: string
  decimals?: number
  help?: ReactNode
  hint?: ReactNode
  // Valor derivado de los datos: muestra «auto» y un botón para volver a él
  auto?: boolean
  onAuto?: () => void
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  scale = 1,
  unit,
  decimals = 0,
  help,
  hint,
  auto,
  onAuto,
}: SliderFieldProps) {
  const id = useId()
  const shown = Number((value * scale).toFixed(decimals))
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {help && <Help>{help}</Help>}
        <span className="ml-auto flex items-center gap-1">
          {auto !== undefined &&
            (auto ? (
              <span className="text-[10px] tracking-wide text-muted-foreground uppercase">auto</span>
            ) : (
              onAuto && (
                <Button variant="ghost" size="icon-xs" onClick={onAuto} aria-label={`Volver ${label} al valor de los datos`}>
                  <RotateCcw />
                </Button>
              )
            ))}
          <NumberInput
            id={id}
            inputMode="decimal"
            className="h-7 w-[4.5rem] px-2 text-right tabular-nums"
            value={shown}
            min={min * scale}
            max={max * scale}
            step={step * scale}
            onCommit={(n) => n != null && onChange(n / scale)}
          />
          {unit && <span className="w-5 text-xs text-muted-foreground">{unit}</span>}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface SwitchFieldProps {
  label: string
  description?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function SwitchField({ label, description, checked, disabled, onChange }: SwitchFieldProps) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {description && <p className="text-xs leading-snug text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}

// Restablece solo una sección del panel (como los «Reset» por grupo de los planificadores financieros)
export function ResetLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-medium text-chart-1 hover:underline">
      Restablecer
    </button>
  )
}

export function SectionTitle({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      {onReset && <ResetLink onClick={onReset} />}
    </div>
  )
}

interface SegmentedFieldProps<T extends string> {
  label: string
  help?: ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

// Control segmentado para elegir entre variantes de un supuesto (más explícito que un interruptor)
export function SegmentedField<T extends string>({ label, help, value, options, onChange }: SegmentedFieldProps<T>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {help && <Help>{help}</Help>}
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="w-full"
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        aria-label={label}
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="flex-1 text-xs">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
