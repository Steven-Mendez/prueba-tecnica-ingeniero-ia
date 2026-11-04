import { useCallback, useEffect, useState } from 'react'

interface Settled<T> {
  key: string
  data: T | null
  error: string | null
}

// Lectura de la API identificada por `key` (cambia la clave → vuelve a pedir). Mientras llega la respuesta nueva
// se conserva la anterior, así las pantallas no parpadean al cambiar un filtro.
export function useApi<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>) {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [last, setLast] = useState<T | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = key ? `${attempt}:${key}` : null

  useEffect(() => {
    if (!requestKey) return
    const ctrl = new AbortController()
    fetcher(ctrl.signal)
      .then((data) => {
        setLast(data)
        setSettled({ key: requestKey, data, error: null })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setSettled({ key: requestKey, data: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => ctrl.abort()
    // fetcher cambia en cada render; la clave describe todo lo que importa de la petición
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const current = settled && settled.key === requestKey ? settled : null
  return {
    data: last,
    loading: requestKey !== null && !current,
    error: current?.error ?? null,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
