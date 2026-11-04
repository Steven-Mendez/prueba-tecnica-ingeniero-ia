import { useEffect, useMemo, useReducer, useState } from 'react'

import { fetchParameterDefaults } from '@/lib/api'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'
import type { ParameterDefaults, Parameters } from '../types'
import { initialParametersState, parametersReducer, sameAssumptions } from './state'

const STORAGE_KEY = 'planner:parameters:v2'

// Valores por defecto de la versión actual de la fuente y lo que el planificador ajustó (persistido en el navegador).
// Si la versión de la fuente cambia, se vuelven a pedir los valores por defecto (lead time, corte, reglas…).
export function useParameters(version: string | null) {
  const [state, dispatch] = useReducer(parametersReducer, initialParametersState)
  const [defaults, setDefaults] = useState<ParameterDefaults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!version) return
    const ctrl = new AbortController()
    fetchParameterDefaults(ctrl.signal)
      .then((d) => {
        setError(null)
        setDefaults(d)
        dispatch({
          type: 'load',
          version,
          base: d.parameters,
          saved: readStorage<{ parameters: Parameters }>(STORAGE_KEY)?.parameters ?? null,
          cutoffs: d.cutoff_options.map((o) => o.cutoff_date),
        })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => ctrl.abort()
  }, [version, attempt])

  const { base, current } = state
  // «Modificado» = algún supuesto distinto del valor por defecto; la ventana elegida no cuenta
  const dirty = useMemo(() => !!base && !!current && !sameAssumptions(base, current), [base, current])

  useEffect(() => {
    if (!current) return
    const windowChosen = current.cutoff_date !== null || current.window_close !== null
    writeStorage(STORAGE_KEY, dirty || windowChosen ? { parameters: current } : null)
  }, [current, dirty])

  return {
    defaults,
    base,
    current,
    dirty,
    dispatch,
    error,
    retry: () => setAttempt((n) => n + 1),
  }
}
