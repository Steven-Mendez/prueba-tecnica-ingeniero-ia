// Etiquetas y colores de los gráficos del Caso 1 (los colores comunes viven en components/charts/colors.ts)
import type { ChartConfig } from '@/components/ui/chart'
import { COLORS } from '@/components/charts/colors'

export { COLORS }

export const orderChartConfig = (windowLabel: string, previousLabel: string, horizonLabel: string) =>
  ({
    position: { label: 'Posición al llegar', color: COLORS.reference },
    order: { label: `Pedido ${windowLabel}`, color: COLORS.primary },
    target: { label: `Demanda ${horizonLabel} + seguridad`, color: COLORS.risk },
    previous: { label: `Pedido ${previousLabel}`, color: COLORS.ink },
  }) satisfies ChartConfig

export const coverageChartConfig = {
  today: { label: 'Hoy (stock + tránsito)', color: COLORS.reference },
  after: { label: 'Tras el pedido', color: COLORS.primary },
} satisfies ChartConfig

// La venta se parte en propia + de clientes que buscaban otro modelo; la demanda ajustada = propia + recuperada
export const historyChartConfig = {
  own: { label: 'Venta propia', color: COLORS.primary },
  returned: { label: 'Venta a clientes de otro modelo', color: COLORS.reference },
  recovered: { label: 'Demanda recuperada', color: COLORS.recovered },
  stock_end: { label: 'Stock a fin de mes', color: COLORS.ink },
} satisfies ChartConfig

export const seasonalityChartConfig = {
  index: { label: 'Índice estacional', color: COLORS.primary },
} satisfies ChartConfig

export const scenarioChartConfig = {
  total_units: { label: 'Unidades', color: COLORS.reference },
} satisfies ChartConfig

export const versionChartConfig = {
  shortfall: { label: 'Faltante hasta fin del horizonte', color: COLORS.reference },
  order: { label: 'Pedido', color: COLORS.primary },
} satisfies ChartConfig

export const waterfallChartConfig = {
  value: { label: 'Unidades', color: COLORS.primary },
} satisfies ChartConfig

// Parte nombres largos de modelo en dos líneas para el eje X
export function splitModelName(name: string): [string, string?] {
  if (name.length <= 10) return [name]
  const words = name.split(' ')
  if (words.length < 2) return [name]
  const cut = words.length > 2 ? 2 : 1
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
}
