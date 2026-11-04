import { useEffect, useState } from 'react'

// Devuelve `value` después de `delay` ms sin cambios. El primer valor no nulo pasa sin espera.
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced == null ? value : debounced
}
