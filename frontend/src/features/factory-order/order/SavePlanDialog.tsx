import { Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createPlan } from '@/lib/api'
import { num0, usdCompact } from '@/lib/format'
import { navigate } from '@/hooks/useHashRoute'
import type { CalculationResult, Parameters } from '../types'

// Guarda el pedido decidido para compararlo con la demanda real cuando los datos cubran el horizonte
interface Props {
  result: CalculationResult
  parameters: Parameters
  onSaved?: () => void
}

export function SavePlanDialog({ result, parameters, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const suggested = `Pedido ${result.calendar.window_label}`

  const save = async () => {
    setSaving(true)
    try {
      const plan = await createPlan(name.trim() || suggested, note, parameters)
      setOpen(false)
      setName('')
      setNote('')
      onSaved?.()
      toast.success(`Pedido «${plan.name}» guardado`, {
        description:
          'Cuenta como tránsito al planificar las ventanas siguientes. En Seguimiento se compara con la demanda real.',
        action: { label: 'Ver', onClick: () => navigate('seguimiento') },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" aria-label="Guardar pedido" data-tour="save">
          <Save />
          <span className="hidden sm:inline">Guardar pedido</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar el pedido de la ventana {result.calendar.window_label}</DialogTitle>
          <DialogDescription>
            {num0(result.kpis.total_units)} unidades · {usdCompact(result.kpis.capital_usd)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nombre</Label>
            <Input id="plan-name" placeholder={suggested} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-note">Nota (opcional)</Label>
            <Textarea
              id="plan-note"
              placeholder="Qué se ajustó a mano y por qué: flotas comprometidas, lanzamientos, acuerdos con fábrica…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
