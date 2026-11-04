import { useCallback, useEffect, useMemo, useState } from 'react'

import { useDebouncedValue } from '@/hooks/useDebouncedValue'

interface Settled {
  key: string
  error: string | null
}

// Petición POST que se repite `delay` ms después del último cambio del cuerpo o cuando llega una versión nueva de
// la fuente. La petición anterior se cancela y el resultado anterior sigue visible hasta que llega el nuevo.
export function useDebouncedRequest<B, T>(
  version: string | null,
  body: B | null,
  fetcher: (body: B, signal: AbortSignal) => Promise<T>,
  delay = 400,
) {
  const [settled, setSettled] = useState<Settled | null>(null)
  const [result, setResult] = useState<T | null>(null)
  const [attempt, setAttempt] = useState(0)

  const request = useMemo(() => (version && body ? JSON.stringify({ version, body }) : null), [version, body])
  const debounced = useDebouncedValue(request, delay)
  const key = debounced ? `${attempt}:${debounced}` : null

  useEffect(() => {
    if (!debounced || !key) return
    const { body: payload } = JSON.parse(debounced) as { body: B }
    const ctrl = new AbortController()
    fetcher(payload, ctrl.signal)
      .then((r) => {
        setResult(r)
        setSettled({ key, error: null })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setSettled({ key, error: e instanceof Error ? e.message : String(e) })
      })
    return () => ctrl.abort()
    // fetcher cambia en cada render; la clave describe todo lo que importa de la petición
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, key])

  const current = settled && settled.key === key ? settled : null
  return {
    result,
    recalculating: request !== debounced || (key !== null && !current),
    error: current?.error ?? null,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
