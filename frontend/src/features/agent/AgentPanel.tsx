import { Maximize2, Sparkles, SquarePen, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { navigate } from '@/hooks/useHashRoute'
import { agent, useAgentState } from './agentStore'
import { Turn } from './ChatMessages'
import { Composer } from './Composer'
import { SUGGESTIONS } from './suggestions'

// Panel lateral del asistente: la misma conversación que la pantalla de chat, acoplada a la derecha para que el
// planificador vea en pantalla lo que el agente cambia o abre. Cerrarlo termina la conversación.
export function AgentPanel({ hidden = false }: { hidden?: boolean }) {
  const { open, status, turns, busy } = useAgentState()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns])

  if (!open || hidden) return null

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-xl sm:w-[440px] md:inset-y-2 md:right-2 md:rounded-xl md:border"
      aria-label="Asistente"
      data-tour="assistant"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Asistente</div>
          <div className="truncate text-xs text-muted-foreground">
            {status?.enabled ? `Agente sobre el planificador · ${status.model}` : 'Sin proveedor configurado'}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                // La conversación sigue en la pantalla completa
                navigate('asistente')
              }}
              aria-label="Abrir en pantalla completa"
            >
              <Maximize2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Pantalla completa</TooltipContent>
        </Tooltip>
        {turns.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={agent.reset} aria-label="Nueva conversación">
                <SquarePen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nueva conversación</TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" size="icon-sm" onClick={agent.close} aria-label="Cerrar asistente">
          <X />
        </Button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pregunta por el pedido, los supuestos, las ventas o el seguimiento. El asistente usa las mismas
              herramientas que la pantalla: no calcula por su cuenta, consulta el motor y te lo explica. Puede
              cambiar los supuestos que ves, abrir secciones y guardar el plan con tu aprobación.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <Button key={s.title} variant="outline" size="xs" className="h-auto py-1 text-left whitespace-normal" onClick={() => void agent.send(s.title)} disabled={!status?.enabled || busy}>
                  {s.title}
                </Button>
              ))}
            </div>
            {status && !status.enabled && (
              <Alert>
                <AlertDescription>
                  Configura <code>OPENAI_API_KEY</code> o <code>ANTHROPIC_API_KEY</code> (ver <code>.env.example</code>) y
                  reinicia la API para activar el asistente.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} busy={busy} />)
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        <Composer enabled={!!status?.enabled} busy={busy} onSend={(t) => void agent.send(t)} onStop={agent.stop} autoFocus />
      </div>
    </aside>
  )
}
