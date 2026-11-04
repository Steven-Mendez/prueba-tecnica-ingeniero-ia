import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModelPicker } from './ModelPicker'

interface Props {
  enabled: boolean
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  autoFocus?: boolean
  size?: 'sm' | 'md'
}

// Cuadro de texto del chat: el texto arriba y, debajo, el selector de modelo y razonamiento a la izquierda y el
// botón de enviar a la derecha. Enter envía, Shift+Enter salta de línea; crece con el texto hasta un máximo.
export function Composer({ enabled, busy, onSend, onStop, autoFocus, size = 'sm' }: Props) {
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy || !enabled) return
    setDraft('')
    onSend(text)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      className={cn(
        'flex flex-col gap-1 rounded-2xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring/40',
        size === 'md' ? 'px-3 pt-3 pb-2' : 'px-2.5 pt-2 pb-1.5',
      )}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={enabled ? 'Pregunta por el pedido, los supuestos, las ventas…' : 'Asistente no configurado'}
        disabled={!enabled}
        rows={1}
        className={cn(
          'max-h-50 min-h-6 w-full resize-none bg-transparent px-1 py-1 outline-none placeholder:text-muted-foreground disabled:opacity-60',
          size === 'md' ? 'text-[15px]' : 'text-sm',
        )}
        aria-label="Mensaje para el asistente"
      />
      <div className="flex items-center justify-between gap-2">
        <ModelPicker compact={size === 'sm'} />
        {busy ? (
          <Button type="button" variant="outline" size="icon-sm" onClick={onStop} aria-label="Detener" className="rounded-full">
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon-sm" disabled={!enabled || !draft.trim()} aria-label="Enviar" className="rounded-full">
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  )
}
