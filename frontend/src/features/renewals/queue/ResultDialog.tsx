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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { createContact } from '@/lib/api'
import { date, signedPct, usd } from '@/lib/format'
import { CONTACT_RESULTS, type ContactResult, type QueueRow } from '../types'

interface Props {
  row: QueueRow
  day: string
  onSaved: () => void
}

// Registrar el resultado de la llamada: la póliza sale de la cola pendiente y alimenta las métricas del piloto
export function ResultDialog({ row, day, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ContactResult | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!result) return
    setSaving(true)
    try {
      await createContact({ policy: row.policy, agent: row.agent, result, note, day })
      toast.success(`Registrado: ${result}`, { description: `${row.policy} · ${row.client_id}` })
      setOpen(false)
      setResult('')
      setNote('')
      onSaved()
    } catch (e: unknown) {
      toast.error('No se pudo registrar el resultado', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-tour="queue-result">
          Registrar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row.policy} · {row.line}
          </DialogTitle>
          <DialogDescription>
            Cliente {row.client_id} · tel. {row.phone ?? '—'} · {row.segment} · {row.insurer} · vence el {date(row.expiry)} (en{' '}
            {row.days_to_expiry} días)
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          <dt className="text-muted-foreground">Prima anterior → renovación</dt>
          <dd className="text-right tabular-nums">
            {usd(row.previous_premium)} → {usd(row.renewal_premium)} ({signedPct(row.premium_change)})
          </dd>
          <dt className="text-muted-foreground">Comisión potencial</dt>
          <dd className="text-right tabular-nums">{usd(row.potential_commission)}</dd>
          <dt className="text-muted-foreground">Score (comisión × mejora)</dt>
          <dd className="text-right tabular-nums">{usd(row.score)}</dd>
          <dt className="text-muted-foreground">Llamadas en la bitácora</dt>
          <dd className="text-right tabular-nums">{row.calls_logged}</dd>
        </dl>
        <div className="space-y-2">
          <Label>Resultado de la llamada</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={result}
            onValueChange={(v) => setResult((v as ContactResult) || '')}
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
            aria-label="Resultado"
          >
            {CONTACT_RESULTS.map((r) => (
              <ToggleGroupItem key={r} value={r} className="h-9 justify-center rounded-md border text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                {r}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {result === 'Número equivocado' && (
            <p className="text-xs text-muted-foreground">Se registra y conviene mandar la póliza a corrección de datos antes de volver a marcar.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`note-${row.policy}`}>Nota (opcional)</Label>
          <Textarea id={`note-${row.policy}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qué dijo el cliente, cuándo volver a llamar…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={!result || saving}>
            Guardar resultado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
