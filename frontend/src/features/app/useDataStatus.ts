import { fetchDataStatus } from '@/lib/api'
import { useSourceStatus } from './useSourceStatus'

// Estado de la fuente del Caso 1 (ver useSourceStatus)
export function useDataStatus() {
  return useSourceStatus(fetchDataStatus)
}
