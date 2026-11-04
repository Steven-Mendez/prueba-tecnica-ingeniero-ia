import { AlertCircle, Check, ChevronRight, Loader2, ShieldCheck, Wrench, X } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { AgentChart } from './AgentChart'
import { agent } from './agentStore'
import type { Approval, ChatTurn, ToolStep } from './types'

// Qué hizo el asistente, en palabras (los nombres de las herramientas están en app/services/agent/tools.py)
const STEP_LABELS: Record<string, string> = {
  contexto: 'Leyó qué hay en pantalla',
  calcular_pedido: 'Calculó un escenario',
  aplicar_supuestos: 'Cambió los supuestos',
  restablecer_supuestos: 'Restableció los supuestos',
  explicar_modelo: 'Revisó un modelo',
  sensibilidad: 'Consultó la sensibilidad',
  precision: 'Consultó el seguimiento',
  ventas: 'Consultó las ventas',
  consultar_hoja: 'Consultó una hoja de datos',
  listar_planes: 'Consultó los planes guardados',
  guardar_plan: 'Guardó el plan',
  cambiar_estado_plan: 'Cambió el estado de un plan',
  borrar_plan: 'Borró un plan',
  exportar_csv: 'Exportó un CSV',
  mostrar: 'Abrió una sección',
  grafico: 'Dibujó un gráfico',
}

const APPROVAL_LABELS: Record<string, string> = {
  guardar_plan: 'Guardar el plan',
  cambiar_estado_plan: 'Cambiar el estado del plan',
  borrar_plan: 'Borrar el plan',
}

const argLabel = (key: string) =>
  ({ nombre: 'Nombre', nota: 'Nota', plan_id: 'Plan', estado: 'Estado' })[key] ?? key

// Texto del asistente: párrafos, viñetas, tablas y **negritas**; suficiente sin una librería de Markdown
export function Rich({ text, className }: { text: string; className?: string }) {
  const inline = (s: string): ReactNode =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    )
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let table: string[][] | null = null
  const flush = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={blocks.length} className={cn('space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
          {list.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>,
      )
      list = null
    }
    if (table) {
      const [head, ...rows] = table
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {head.map((h, i) => (
                  <th key={i} className={cn('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t even:bg-muted/20">
                  {r.map((c, j) => (
                    <td key={j} className={cn('px-3 py-1.5', j > 0 && 'text-right tabular-nums', j === 0 && 'font-medium')}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      table = null
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    // Tablas Markdown: filas que empiezan con «|»; la fila de guiones es el separador del encabezado
    if (line.startsWith('|')) {
      if (list) flush()
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
      table = [...(table ?? []), cells]
      continue
    }
    if (table) flush()
    const bullet = /^[-•*]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1])
    } else if (line) {
      flush()
      const heading = /^#{1,3}\s+(.*)$/.exec(line)
      blocks.push(
        heading ? (
          <p key={blocks.length} className="font-medium">
            {inline(heading[1])}
          </p>
        ) : (
          <p key={blocks.length}>{inline(line)}</p>
        ),
      )
    }
  }
  flush()
  return <div className={cn('space-y-2.5 leading-relaxed', className)}>{blocks}</div>
}

// Una llamada a herramienta: qué hizo y, desplegable, con qué argumentos (como las tarjetas de agent-chat-ui)
function Step({ step }: { step: ToolStep }) {
  const args = Object.entries(step.args ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '')
  const icon =
    step.ok === null ? (
      <Loader2 className="size-3 animate-spin" aria-hidden />
    ) : step.ok ? (
      <Check className="size-3 text-chart-1" aria-hidden />
    ) : (
      <AlertCircle className="size-3 text-chart-3" aria-hidden />
    )
  const label = (
    <>
      {icon}
      <span>{STEP_LABELS[step.name] ?? step.name}</span>
      <code className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">{step.name}</code>
    </>
  )
  if (!args.length) return <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{label}</div>
  return (
    <Collapsible className="group text-xs text-muted-foreground">
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded hover:text-foreground">
        {label}
        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap text-foreground/80">
          {JSON.stringify(Object.fromEntries(args), null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Steps({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null
  return (
    <div className="space-y-1 rounded-lg border border-dashed px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase">
        <Wrench className="size-3" aria-hidden /> Herramientas
      </div>
      {steps.map((s, i) => (
        <Step key={i} step={s} />
      ))}
    </div>
  )
}

// Human in the loop: el agente se detuvo antes de una acción y espera la decisión del planificador
function ApprovalCard({ approval, busy }: { approval: Approval; busy: boolean }) {
  const decided = approval.decision
  return (
    <div className={cn('space-y-3 rounded-xl border p-3', decided ? 'bg-muted/40' : 'border-primary/40 bg-primary/5')}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        {decided ? (decided === 'approve' ? 'Aprobado' : 'Rechazado') : 'Requiere tu aprobación'}
      </div>
      <ul className="space-y-2">
        {approval.requests.map((r, i) => (
          <li key={i} className="rounded-lg bg-background/80 px-3 py-2 text-sm">
            <div className="font-medium">{APPROVAL_LABELS[r.name] ?? r.name}</div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {Object.entries(r.args)
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .map(([k, v]) => (
                  <Fragment key={k}>
                    <dt>{argLabel(k)}</dt>
                    <dd className="text-foreground">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                  </Fragment>
                ))}
            </dl>
          </li>
        ))}
      </ul>
      {!decided && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void agent.decide('approve')} disabled={busy}>
            <Check /> Aprobar
          </Button>
          <Button size="sm" variant="outline" onClick={() => void agent.decide('reject', 'El planificador rechazó la acción. No la repitas.')} disabled={busy}>
            <X /> Rechazar
          </Button>
        </div>
      )}
    </div>
  )
}

// Un turno de la conversación. `size` ajusta tipografía y gráficos: compacto en el panel, cómodo en la pantalla.
export function Turn({ turn, size = 'sm', busy = false }: { turn: ChatTurn; size?: 'sm' | 'md'; busy?: boolean }) {
  const text = size === 'md' ? 'text-[15px]' : 'text-sm'
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={cn('max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground whitespace-pre-wrap', text)}>
          {turn.text}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Steps steps={turn.steps} />
      {turn.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {turn.actions.map((a, i) => (
            <Badge key={i} variant="secondary" className="font-normal">
              {a}
            </Badge>
          ))}
        </div>
      )}
      {turn.charts.map((c, i) => (
        <AgentChart key={i} spec={c} size={size} />
      ))}
      {turn.text && <Rich text={turn.text} className={text} />}
      {turn.approval && <ApprovalCard approval={turn.approval} busy={busy} />}
      {!turn.text && turn.pending && !turn.approval && (
        <p className={cn('text-muted-foreground', text)} aria-live="polite">
          Pensando…
        </p>
      )}
      {turn.error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{turn.error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
