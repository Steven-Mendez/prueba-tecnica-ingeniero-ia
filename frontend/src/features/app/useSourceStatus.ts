import { useCallback, useEffect, useState } from 'react'

// Estado de una fuente de datos. En el prototipo la fuente es el Excel del caso, que no cambia: se consulta una
// vez. Su versión es la clave de todo lo que se pide a la API, así que si en producción el ETL dejara una versión
// nueva, bastaría volver a consultarla para que todo el caso se recalcule.
export function useSourceStatus<T extends { version: string }>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const [status, setStatus] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetcher(ctrl.signal).then(
      (next) => {
        setStatus(next)
        setError(null)
      },
      (e: unknown) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => ctrl.abort()
    // fetcher es una función de módulo estable; la clave es el intento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  return {
    status,
    version: status?.version ?? null,
    error,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
