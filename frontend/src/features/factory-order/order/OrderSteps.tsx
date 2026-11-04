import { Check, ChevronRight, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { date, num0, usdCompact } from '@/lib/format'
import { navigate } from '@/hooks/useHashRoute'
import type { CalculationResult, CutoffOption } from '../types'
import { KIND_LABEL } from './WindowSelect'

interface StepProps {
  n: number
  title: string
  done: boolean
  children: ReactNode
  action?: ReactNode
  className?: string
}

function Step({ n, title, done, children, action, className }: StepProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 px-5 py-4', className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            done ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground',
          )}
          aria-hidden
        >
          {done ? <Check className="size-3" /> : n}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="text-sm text-muted-foreground">{children}</div>
      {action && <div className="mt-auto pt-1">{action}</div>}
    </div>
  )
}

interface Props {
  result: CalculationResult
  window: CutoffOption | null
  changes: number
  overrides: number
  panelOpen: boolean
  onTogglePanel: () => void
  // Botón «Guardar pedido» (el diálogo vive en la página porque necesita los parámetros)
  save: ReactNode
}

// El camino para armar el paquete: ventana → supuestos → ajustes por modelo → guardar. Cada paso dice en qué
// estado está, para que el planificador vea de un vistazo qué le falta.
export function OrderSteps({ result, window, changes, overrides, panelOpen, onTogglePanel, save }: Props) {
  const { kpis, calendar } = result
  const saved = result.window_plans[0]
  const kind = window?.kind ?? result.window_kind

  return (
    <Card className="grid gap-0 divide-y py-0 @3xl:grid-cols-2 @3xl:divide-y-0 @5xl:grid-cols-4" data-tour="steps">
      <Step n={1} title="Ventana" done className="@3xl:border-r">
        <span className="font-medium text-foreground">{calendar.window_label}</span> · cierra {date(calendar.window_close)}
        <br />
        <Badge variant="outline" className="mt-1 font-normal">
          {KIND_LABEL[kind]}
        </Badge>
      </Step>
      <Step
        n={2}
        title="Supuestos"
        done={changes > 0}
        className="@5xl:border-r"
        action={
          <Button
            variant={panelOpen ? 'secondary' : 'outline'}
            size="xs"
            onClick={onTogglePanel}
            aria-pressed={panelOpen}
            data-tour="params-button"
          >
            <SlidersHorizontal />
            {panelOpen ? 'Ocultar supuestos' : 'Revisar supuestos'}
          </Button>
        }
      >
        {changes > 0
          ? `${changes} ${changes === 1 ? 'supuesto cambiado' : 'supuestos cambiados'} respecto de los valores por defecto.`
          : 'Lead time, demanda y seguridad con los valores que dicen los datos.'}
      </Step>
      <Step
        n={3}
        title="Ajustes por modelo"
        done={overrides > 0}
        className="@3xl:border-r"
        action={
          <Button
            variant="outline"
            size="xs"
            onClick={() => document.getElementById('order-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Ir a la tabla
            <ChevronRight />
          </Button>
        }
      >
        {overrides > 0
          ? `${overrides} ${overrides === 1 ? 'modelo ajustado' : 'modelos ajustados'} a mano.`
          : 'Escribe otra cantidad en la columna Pedido si no sigues la recomendación, o abre el modelo para ver cómo se llega.'}
      </Step>
      <Step n={4} title="Paquete a pedir" done={!!saved} action={save}>
        <span className="text-xl font-semibold tracking-tight text-foreground tabular-nums">{num0(kpis.total_units)} u.</span>{' '}
        <span className="text-foreground">· {usdCompact(kpis.capital_usd)}</span>
        <br />
        {saved ? (
          <button type="button" className="text-left hover:underline" onClick={() => navigate('seguimiento')}>
            Guardado como «{saved.name}» · {saved.status === 'sent' ? 'enviado a fábrica' : 'borrador'}
            {saved.total_units !== kpis.total_units && ` · ${num0(saved.total_units)} u.`}
          </button>
        ) : (
          'Todavía no se ha guardado un pedido para esta ventana.'
        )}
      </Step>
    </Card>
  )
}
