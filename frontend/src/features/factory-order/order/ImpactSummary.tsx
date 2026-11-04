import { RotateCcw, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { joinEs, num0, signedNum, usdCompact } from '@/lib/format'
import type { CalculationResult } from '../types'

const MAX_MODELS = 4

// Resumen de lo que cambian los parámetros movidos frente a los valores por defecto (mismo corte)
export function ImpactSummary({
  result,
  changes,
  onReset,
}: {
  result: CalculationResult
  changes: string[]
  onReset: () => void
}) {
  const { baseline, kpis } = result
  if (!baseline || changes.length === 0) return null

  const diff = kpis.total_units - baseline.total_units
  const moved = result.order
    .map((r) => ({ model: r.model, from: baseline.orders[r.model] ?? 0, to: r.order }))
    .filter((m) => m.from !== m.to)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
  const shown = moved.slice(0, MAX_MODELS).map((m) => `${m.model} ${m.from} → ${m.to}`)
  const rest = moved.length - shown.length

  return (
    <section
      className="rounded-xl border border-chart-1/30 bg-chart-1/5 px-4 py-3"
      aria-label="Impacto de los cambios"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-chart-1 uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            Impacto de tus cambios
          </div>
          <p className="text-sm leading-relaxed">
            {diff === 0 && moved.length === 0 ? (
              <>Con estos supuestos el pedido no cambia: sigue en {num0(kpis.total_units)} unidades.</>
            ) : (
              <>
                El pedido pasa de <strong>{num0(baseline.total_units)}</strong> a{' '}
                <strong>{num0(kpis.total_units)}</strong> unidades ({signedNum(diff)}) y el capital de{' '}
                {usdCompact(baseline.capital_usd)} a {usdCompact(kpis.capital_usd)}.
                {shown.length > 0 && (
                  <>
                    {' '}
                    {moved.length === 1 ? 'Cambia' : 'Cambian'} {joinEs(shown)}
                    {rest > 0 ? ` y ${rest} ${rest === 1 ? 'modelo más' : 'modelos más'}` : ''}.
                  </>
                )}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {changes.map((c) => (
              <Badge key={c} variant="secondary" className="font-normal">
                {c}
              </Badge>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw />
          Restablecer
        </Button>
      </div>
    </section>
  )
}
