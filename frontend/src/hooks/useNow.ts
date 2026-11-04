import { useEffect, useState } from 'react'

// Hora actual que se actualiza cada `ms` (para textos relativos como «revisado hace 12 s»)
export function useNow(ms = 15000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
