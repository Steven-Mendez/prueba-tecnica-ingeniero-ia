// Formato de números y fechas en es-NI. Los meses usan un mapa propio (Intl da «sept»), como el notebook.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const usdFormat = new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCompactFormat = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const int = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dec2 = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0, signDisplay: 'exceptZero' })
const pctFormat = new Intl.NumberFormat('es-NI', { style: 'percent', maximumFractionDigits: 0 })
const pct1Format = new Intl.NumberFormat('es-NI', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pctSigned = new Intl.NumberFormat('es-NI', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })

const dash = '—'
const safe = (fmt: (v: number) => string) => (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? dash : fmt(v)

export const usd = safe((v) => usdFormat.format(v))
export const usdCompact = safe((v) => usdCompactFormat.format(v))
export const num0 = safe((v) => int.format(v))
export const num1 = safe((v) => dec1.format(v))
export const num2 = safe((v) => dec2.format(v))
export const signedNum = safe((v) => signed.format(Math.round(v)))
export const pct = safe((v) => pctFormat.format(v))
export const pct1 = safe((v) => pct1Format.format(v))
export const signedPct = safe((v) => pctSigned.format(v))
export const months = safe((v) => `${dec1.format(v)} m`)
export const units = safe((v) => `${int.format(v)} u.`)

function parseIso(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

// '2027-02-11' → '11 feb 2027'
export function date(iso: string): string {
  const [y, m, d] = parseIso(iso)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

// '2026-10-30' → 'oct-2026' (etiqueta de ventana, como en la API)
export function windowLabel(iso: string): string {
  const [y, m] = parseIso(iso)
  return `${MONTHS[m - 1]}-${y}`
}

// '2026-09' → 'sep-26'
export function monthShort(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return `${MONTHS[m - 1]}-${String(y).slice(2)}`
}

// '2026-09' → 'septiembre 2026'
export function monthLong(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

export function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// '2026-11-03T22:48:00Z' → '3 nov 2026, 22:48' (hora local)
export function dateTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

// Tiempo transcurrido en palabras: 'hace 12 s', 'hace 5 min', 'hace 3 h', 'hace 2 días'
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} días`
}
