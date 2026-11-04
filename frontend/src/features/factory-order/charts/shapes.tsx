// Formas SVG para Recharts. Las props llegan de Recharts al clonar el elemento.
import { Rectangle } from 'recharts'

import { splitModelName } from './config'

interface DotProps {
  cx?: number
  cy?: number
  value?: unknown
}

// Punto de la demanda objetivo: 10 px con anillo del color de la superficie (marcas superpuestas)
export function TargetDot({ cx, cy, value, fill }: DotProps & { fill: string }) {
  if (cx == null || cy == null || value == null) return null
  return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="var(--card)" strokeWidth={2} />
}

// Guion horizontal del pedido de la ventana anterior (como el "_" de la figura del notebook)
export function PreviousMark({ cx, cy, value, stroke }: DotProps & { stroke: string }) {
  if (cx == null || cy == null || value == null) return null
  return (
    <g>
      <line x1={cx - 13} x2={cx + 13} y1={cy} y2={cy} stroke="var(--card)" strokeWidth={6} strokeLinecap="round" />
      <line x1={cx - 13} x2={cx + 13} y1={cy} y2={cy} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  )
}

interface BarShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  payload?: Record<string, unknown>
}

// Segmento de una barra apilada: deja 2 px de superficie sobre lo que tiene debajo y redondea el extremo
// superior solo si no hay nada encima (marcas finas, sin bordes)
export function StackSegment({ below = [], above = [], ...props }: BarShapeProps & { below?: string[]; above?: string[] }) {
  const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props
  if (height <= 0) return null
  const positive = (keys: string[]) => keys.some((k) => Number(payload?.[k] ?? 0) > 0)
  const gap = positive(below) ? Math.min(2, height / 2) : 0
  const radius: [number, number, number, number] | number = positive(above) ? 0 : [4, 4, 0, 0]
  return <Rectangle x={x} y={y} width={width} height={height - gap} fill={fill} radius={radius} />
}

interface TickProps {
  x?: number
  y?: number
  payload?: { value?: unknown }
}

// Nombre del modelo en el eje X, en dos líneas si es largo ("Land Cruiser" / "Prado")
export function ModelTick({ x = 0, y = 0, payload }: TickProps) {
  const [first, second] = splitModelName(String(payload?.value ?? ''))
  return (
    <text x={x} y={y + 12} textAnchor="middle" fill="var(--muted-foreground)" fontSize={11}>
      <tspan x={x}>{first}</tspan>
      {second && (
        <tspan x={x} dy={13}>
          {second}
        </tspan>
      )}
    </text>
  )
}

interface RefLabelProps {
  viewBox?: { x?: number; y?: number; width?: number; height?: number }
  text: string
  color: string
  // 'right': la etiqueta empieza en la línea; 'left': termina en ella
  align?: 'left' | 'right'
  // Fila sobre el gráfico (0 = la más cercana): dos etiquetas en filas distintas no se pisan
  row?: number
}

// Etiqueta en recuadro sobre una línea de referencia vertical (como los hitos de los planificadores financieros)
export function RefLabel({ viewBox, text, color, align = 'right', row = 0 }: RefLabelProps) {
  const x = viewBox?.x ?? 0
  const y = (viewBox?.y ?? 0) - row * 20
  const width = text.length * 5.6 + 14
  const left = align === 'right' ? x : x - width
  return (
    <g>
      <rect x={left} y={y - 20} width={width} height={17} rx={4} fill="var(--card)" stroke={color} strokeWidth={1.25} />
      <text x={left + width / 2} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={500} fill="var(--foreground)">
        {text}
      </text>
    </g>
  )
}
