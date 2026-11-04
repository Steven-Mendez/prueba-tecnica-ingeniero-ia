import { useCallback, useEffect, useState } from 'react'

import { fetchDataStatus } from '@/lib/api'
import type { DataStatus } from '@/features/data/types'

// Estado de la fuente de datos. En el prototipo la fuente es el Excel del caso, que no cambia: se consulta una vez.
// Su versión es la clave de todo lo que se pide a la API, así que si en producción el ETL dejara una versión nueva,
// bastaría volver a consultarla para que toda la app se recalcule.
export function useDataStatus() {
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchDataStatus(ctrl.signal).then(
      (next) => {
        setStatus(next)
        setError(null)
      },
      (e: unknown) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => ctrl.abort()
  }, [attempt])

  return {
    status,
    version: status?.version ?? null,
    error,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
