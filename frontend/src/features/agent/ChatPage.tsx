import { Sparkles, SquarePen } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/features/app/PageHeader'
import { agent, useAgentState } from './agentStore'
import { Turn } from './ChatMessages'
import { Composer } from './Composer'
import { AGENT_COPY } from './suggestions'

// Pantalla de chat a página completa: columna centrada de mensajes, sugerencias al empezar y el cuadro de texto
// fijo abajo. Es una demo: la conversación vive mientras estás aquí (o en el panel) y se pierde al salir.
export default function ChatPage() {
  const { status, turns, busy, case: caseId } = useAgentState()
  const copy = AGENT_COPY[caseId]
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])
  useEffect(() => () => agent.leaveChatPage(), [])

  const enabled = !!status?.enabled

  return (
    <div className="flex h-svh flex-col md:h-[calc(100svh-1rem)]">
      <PageHeader
        crumbs={[{ label: 'Asistente' }]}
        actions={
          <>
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
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {turns.length === 0 ? (
            <div className="flex min-h-[55svh] flex-col justify-end gap-6">
              <div className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-5" aria-hidden />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
                <p className="max-w-xl text-sm text-muted-foreground sm:text-[15px]">{copy.intro}</p>
              </div>
              {status && !enabled && (
                <Alert>
                  <AlertDescription>
                    Configura <code>OPENAI_API_KEY</code> o <code>ANTHROPIC_API_KEY</code> (ver <code>.env.example</code>)
                    y reinicia la API para activar el asistente.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {copy.suggestions.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => void agent.send(s.title)}
                    disabled={!enabled || busy}
                    className="rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {turns.map((t) => (
                <Turn key={t.id} turn={t} size="md" busy={busy} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Composer enabled={enabled} busy={busy} onSend={(t) => void agent.send(t)} onStop={agent.stop} autoFocus size="md" />
          <p className="pt-2 text-center text-xs text-muted-foreground">{copy.footer}</p>
        </div>
      </div>
    </div>
  )
}
