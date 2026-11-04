// Colores de los gráficos. Cada color tiene un trabajo fijo en toda la app (ver index.css):
// azul = serie principal / propuesta, naranja = recuperado / simulado, rojo = riesgo, gris = referencia, tinta = previo.
export const COLORS = {
  primary: 'var(--chart-1)',
  recovered: 'var(--chart-2)',
  risk: 'var(--chart-3)',
  reference: 'var(--chart-4)',
  ink: 'var(--chart-5)',
  primarySoft: 'color-mix(in oklab, var(--chart-1) 55%, var(--card))',
} as const
