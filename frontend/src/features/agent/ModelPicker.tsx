import { Brain, Cpu } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { agent, useAgentState } from './agentStore'
import type { Reasoning } from './types'

const REASONING: { value: Reasoning; label: string; hint: string }[] = [
  { value: 'low', label: 'Rápido', hint: 'razonamiento bajo' },
  { value: 'medium', label: 'Equilibrado', hint: 'razonamiento medio' },
  { value: 'high', label: 'Profundo', hint: 'razonamiento alto' },
]

// Selector de modelo y de esfuerzo de razonamiento (los valores vienen del proveedor configurado en la API).
// Va dentro del cuadro de texto del chat.
export function ModelPicker({ compact = false }: { compact?: boolean }) {
  const { status, model, reasoning, busy } = useAgentState()
  if (!status?.enabled) return null
  const trigger = 'h-7 gap-1 rounded-full border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-muted'
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Select value={model ?? status.model ?? ''} onValueChange={(v) => agent.setModel(v)} disabled={busy}>
        <SelectTrigger size="sm" className={trigger} aria-label="Modelo">
          <Cpu className="size-3.5 text-muted-foreground" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {status.models.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={reasoning} onValueChange={(v) => agent.setReasoning(v as Reasoning)} disabled={busy}>
        <SelectTrigger size="sm" className={trigger} aria-label="Razonamiento">
          <Brain className="size-3.5 text-muted-foreground" aria-hidden />
          <SelectValue>{REASONING.find((r) => r.value === reasoning)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {REASONING.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              <span>{r.label}</span>
              {!compact && <span className="text-xs text-muted-foreground">· {r.hint}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
