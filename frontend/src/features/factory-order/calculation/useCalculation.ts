import { calculateOrder } from '@/lib/api'
import { useDebouncedRequest } from '@/hooks/useDebouncedRequest'
import type { CalculationResult, Parameters } from '../types'

// Recalcula el pedido 400 ms después del último cambio de parámetros o cuando llega una versión nueva de la fuente
export function useCalculation(version: string | null, parameters: Parameters | null) {
  return useDebouncedRequest<Parameters, CalculationResult>(version, parameters, calculateOrder)
}
