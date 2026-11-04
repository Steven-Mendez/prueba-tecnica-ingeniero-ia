import { date, num1 } from '@/lib/format'
import type { Calendar } from '../types'

const DAY = 24 * 60 * 60 * 1000
const time = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).getTime()

// Línea de tiempo del ciclo (§2): el hueco lo cubren stock y tránsito; el horizonte, este pedido
export function CycleTimeline({ calendar }: { calendar: Calendar }) {
  const start = time(calendar.cutoff_date)
  const end = time(calendar.next_arrival)
  const at = (iso: string) => ((time(iso) - start) / (end - start)) * 100
  const marks = [
    { iso: calendar.cutoff_date, label: 'Corte' },
    { iso: calendar.window_close, label: 'Cierre' },
    { iso: calendar.arrival, label: 'Llega el pedido' },
    { iso: calendar.next_window_close, label: 'Cierre siguiente' },
    { iso: calendar.next_arrival, label: 'Llega el siguiente' },
  ]
  const gapEnd = at(calendar.arrival)

  return (
    <div className="space-y-2 pt-10 pb-12" role="img" aria-label={`Hueco de ${num1(calendar.gap_months)} meses y horizonte de ${num1(calendar.horizon_months)} meses`}>
      <div className="relative h-3">
        <div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{ width: `${gapEnd}%`, background: 'color-mix(in oklab, var(--chart-3) 30%, var(--card))' }}
        />
        <div
          className="absolute inset-y-0 right-0 rounded-r-full bg-chart-1"
          style={{ left: `calc(${gapEnd}% + 2px)` }}
        />
        {marks.map((m, i) => {
          const x = at(m.iso)
          const above = i % 2 === 1
          return (
            <div key={m.label} className="absolute top-1/2" style={{ left: `${x}%` }}>
              <div className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground" />
              <div
                className={`absolute -translate-x-1/2 text-center text-[11px] leading-tight whitespace-nowrap ${above ? 'bottom-3' : 'top-3'}`}
                style={{ transform: `translateX(${x < 8 ? '0' : x > 92 ? '-100%' : '-50%'})` }}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-muted-foreground tabular-nums">{date(m.iso)}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="relative text-xs text-muted-foreground">
        <span className="absolute" style={{ left: 0, width: `${gapEnd}%`, top: 40 }}>
          Hueco: {num1(calendar.gap_months)} meses ({Math.round((time(calendar.arrival) - start) / DAY)} días)
        </span>
      </div>
    </div>
  )
}
