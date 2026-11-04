import { useEffect, useMemo, useReducer, useState } from 'react'

import { fetchRenewalDefaults } from '@/lib/api'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'
import type { ParameterDefaults, Parameters } from '../types'
import { initialState, renewalParametersReducer, sameParameters } from './state'

const STORAGE_KEY = 'renewals:parameters:v1'

// Valores por defecto de la versión actual de la fuente y lo que se ajustó en pantalla (persistido en el navegador)
export function useRenewalParameters(version: string | null) {
  const [state, dispatch] = useReducer(renewalParametersReducer, initialState)
  const [defaults, setDefaults] = useState<ParameterDefaults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!version) return
    const ctrl = new AbortController()
    fetchRenewalDefaults(ctrl.signal)
      .then((d) => {
        setError(null)
        setDefaults(d)
        dispatch({
          type: 'load',
          version,
          base: d.parameters,
          saved: readStorage<{ parameters: Parameters }>(STORAGE_KEY)?.parameters ?? null,
        })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => ctrl.abort()
  }, [version, attempt])

  const { base, current } = state
  const dirty = useMemo(() => !!base && !!current && !sameParameters(base, current), [base, current])

  useEffect(() => {
    if (!current) return
    writeStorage(STORAGE_KEY, dirty ? { parameters: current } : null)
  }, [current, dirty])

  return { defaults, base, current, dirty, dispatch, error, retry: () => setAttempt((n) => n + 1) }
}
