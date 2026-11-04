import { History } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { date, num0, signedPct } from '@/lib/format'
import type { CalculationResult } from '../types'

// Con un corte pasado, compara lo que habría pedido la herramienta con lo que de verdad se pidió y se vendió
export function HistoricalCheck({ result }: { result: CalculationResult }) {
  const { kpis, calendar } = result
  if (kpis.actual_window_units == null && kpis.actual_horizon_sales == null) return null
  const salesGap =
    kpis.actual_horizon_sales != null && kpis.horizon_demand_total > 0
      ? kpis.actual_horizon_sales / kpis.horizon_demand_total - 1
      : null
  return (
    <Alert>
      <History />
      <AlertTitle>Validación histórica · ventana {calendar.window_label}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>
          Datos hasta el {date(calendar.cutoff_date)}.
          {kpis.actual_window_units != null &&
            ` Herramienta: ${num0(kpis.total_units)} u. · pedido real: ${num0(kpis.actual_window_units)} u.`}
        </p>
        {kpis.actual_horizon_sales != null && salesGap != null && (
          <p>
            Demanda proyectada {calendar.horizon_label}: {num0(kpis.horizon_demand_total)} u. · venta real:{' '}
            {num0(kpis.actual_horizon_sales)} u. ({signedPct(salesGap)})
          </p>
        )}
        {kpis.actual_horizon_sales == null && <p>Horizonte aún sin datos.</p>}
      </AlertDescription>
    </Alert>
  )
}
