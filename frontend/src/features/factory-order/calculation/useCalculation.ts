import { useCallback, useEffect, useMemo, useState } from 'react'

import { calculateOrder } from '@/lib/api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { CalculationResult, Parameters } from '../types'

interface Settled {
  key: string
  error: string | null
}

// Recalcula el pedido 400 ms después del último cambio de parámetros o cuando llega una versión nueva de la
// fuente. La petición anterior se cancela y el resultado anterior sigue visible hasta que llega el nuevo.
export function useCalculation(version: string | null, parameters: Parameters | null) {
  const [settled, setSettled] = useState<Settled | null>(null)
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [attempt, setAttempt] = useState(0)

  const request = useMemo(
    () => (version && parameters ? JSON.stringify({ version, parameters }) : null),
    [version, parameters],
  )
  const debounced = useDebouncedValue(request, 400)
  const key = debounced ? `${attempt}:${debounced}` : null

  useEffect(() => {
    if (!debounced || !key) return
    const { parameters: body } = JSON.parse(debounced) as { parameters: Parameters }
    const ctrl = new AbortController()
    calculateOrder(body, ctrl.signal)
      .then((r) => {
        setResult(r)
        setSettled({ key, error: null })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setSettled({ key, error: e instanceof Error ? e.message : String(e) })
      })
    return () => ctrl.abort()
  }, [debounced, key])

  const current = settled && settled.key === key ? settled : null
  return {
    result,
    recalculating: request !== debounced || (key !== null && !current),
    error: current?.error ?? null,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
