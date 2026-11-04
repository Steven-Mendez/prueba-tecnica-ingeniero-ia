import { ChevronDown, Eraser, RotateCcw } from 'lucide-react'
import type { Dispatch } from 'react'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DatePicker } from '@/components/DatePicker'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { date, num0, pct1 } from '@/lib/format'
import type { CorrectionInfo, DerivedParameters, ParameterDefaults, Parameters } from '../types'
import { EndOfLifeField } from './EndOfLifeField'
import { Help, ResetLink, SectionTitle, SegmentedField, SliderField, SwitchField } from './fields'
import { SECTION_FIELDS, sectionChanged, type ParametersAction } from './state'

interface Props {
  defaults: ParameterDefaults
  base: Parameters
  parameters: Parameters
  // Valores derivados para el corte actual (vienen del último cálculo; antes, los del corte por defecto)
  derived: DerivedParameters
  // Corrección aprendida disponible para el corte actual (del último cálculo)
  correction: CorrectionInfo | null
  changes: string[]
  dispatch: Dispatch<ParametersAction>
}

// Panel de supuestos. Cada control lleva una ayuda que explica qué mueve en el cálculo (el código S1.x remite a
// la tabla de supuestos del notebook). Los parámetros que se multiplican entre sí van juntos (tardías × retraso).
export function ParameterPanel({ defaults, base, parameters: p, derived, correction, changes, dispatch }: Props) {
  const resetFor = (section: keyof typeof SECTION_FIELDS) =>
    sectionChanged(base, p, SECTION_FIELDS[section])
      ? () => dispatch({ type: 'resetFields', fields: [...SECTION_FIELDS[section]] })
      : undefined
  const resetSafety = resetFor('safety')
  const set = <K extends Exclude<keyof Parameters, 'overrides' | 'end_of_life'>>(field: K, value: Parameters[K]) =>
    dispatch({ type: 'set', field, value })
  const overrideCount = Object.keys(p.overrides).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-x-hidden overflow-y-auto pr-2 pb-4">
        <section className="space-y-4">
          <SectionTitle onReset={resetFor('cycle')}>Ciclo</SectionTitle>
          <p className="text-xs leading-snug text-muted-foreground">
            Datos al {date(derived.cutoff_date)}. La ventana se elige arriba, junto al título.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="window-close" className="text-sm">
                Cierre de la ventana
              </Label>
              <Help>
                Día en que fábrica cierra la ventana de pedido ({derived.sources.window_close.toLowerCase()}). El
                pedido llega cierre + lead time; moverlo desplaza la llegada y el hueco que deben cubrir stock y
                tránsito.
              </Help>
              <span className="ml-auto">
                {p.window_close === null ? (
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">auto</span>
                ) : (
                  <Button variant="ghost" size="icon-xs" onClick={() => set('window_close', null)} aria-label="Cierre automático">
                    <RotateCcw />
                  </Button>
                )}
              </span>
            </div>
            <DatePicker
              id="window-close"
              className="w-full"
              value={p.window_close ?? derived.window_close}
              min={p.cutoff_date ?? derived.cutoff_date}
              onChange={(v) => set('window_close', v)}
            />
          </div>
          <SliderField
            label="Lead time"
            unit="d"
            value={p.lead_time_days ?? derived.lead_time_days}
            min={60}
            max={180}
            step={1}
            onChange={(v) => set('lead_time_days', Math.round(v))}
            auto={p.lead_time_days === null}
            onAuto={() => set('lead_time_days', null)}
            help={`Días del cierre de la ventana a la llegada del pedido. Auto: ${derived.sources.lead_time_days.toLowerCase()}. Un lead time mayor alarga el hueco y adelanta los quiebres.`}
            hint={`Observado ${num0(derived.lead_time_days)} d · comunicado ${num0(derived.communicated_lead_time_days)} d`}
          />
          <SliderField
            label="Llegadas tardías"
            unit="%"
            scale={100}
            value={p.late_share ?? derived.late_share}
            min={0}
            max={0.4}
            step={0.005}
            decimals={1}
            onChange={(v) => set('late_share', v)}
            auto={p.late_share === null}
            onAuto={() => set('late_share', null)}
            help={`Fracción de las unidades que llega después del lead time (${derived.sources.late_share.toLowerCase()}). Junto con el retraso de abajo suma una reserva al stock de seguridad: tardías × retraso × demanda mensual.`}
            hint={`Observado ${pct1(derived.late_share)}`}
          />
          <SliderField
            label="Retraso de las tardías"
            unit="m"
            value={p.late_delay_months}
            min={0}
            max={3}
            step={0.5}
            decimals={1}
            onChange={(v) => set('late_delay_months', v)}
            help="Meses que se retrasan las unidades tardías. Con 0 las llegadas tardías no afectan el pedido."
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <SectionTitle onReset={resetFor('demand')}>Demanda</SectionTitle>
          <SliderField
            label="Ajuste de demanda"
            unit="%"
            scale={100}
            value={p.demand_multiplier - 1}
            min={-0.4}
            max={0.4}
            step={0.05}
            onChange={(v) => set('demand_multiplier', Math.round((1 + v) * 100) / 100)}
            help="Escala la demanda mensual de todos los modelos por igual (lo que los datos no saben: promociones, lanzamientos, mercado). Para un solo modelo, usa el ajuste por modelo en la tabla."
          />
          <SliderField
            label="Meses de historia"
            unit="m"
            value={p.demand_window_months}
            min={6}
            max={24}
            step={1}
            onChange={(v) => set('demand_window_months', Math.round(v))}
            help="Meses de venta hacia atrás desde el corte con los que se promedia la demanda mensual y su variabilidad. Menos meses reaccionan más rápido; más meses suavizan."
          />
          <SegmentedField
            label="Demanda en meses sin stock"
            help="Cómo se corrige la venta censurada de los meses en que el modelo estuvo en cero. «Leads + sustituciones» suma los leads perdidos por disponibilidad y las ventas que se fueron a otro modelo; «Promedio con stock» ignora esos meses y promedia solo los que tuvieron stock (es el escenario alternativo de la pestaña Sensibilidad)."
            value={p.demand_in_stock_months_only ? 'in_stock' : 'recover'}
            options={[
              { value: 'recover', label: 'Leads + sustituciones' },
              { value: 'in_stock', label: 'Promedio con stock' },
            ]}
            onChange={(v) => set('demand_in_stock_months_only', v === 'in_stock')}
          />
          <SwitchField
            label="Sustitución en el hueco"
            description="Mientras un modelo siga en cero, sus clientes compran otro (RAV4 y Raize reciben a Corolla Cross y Rush). Apagado: cada modelo solo con su demanda."
            checked={p.substitution_in_gap}
            onChange={(v) => set('substitution_in_gap', v)}
          />
          <SwitchField
            label="Corrección aprendida"
            description={
              correction?.available
                ? `Corrige cada modelo con su sesgo en ciclos ya cerrados (±25 % máx.): ${correction.cycles_used} ciclos, hasta ${correction.last_window_label}. Detalle en Seguimiento.`
                : 'Corrige cada modelo con su sesgo en ciclos ya cerrados. Requiere 2 ciclos cerrados antes del corte.'
            }
            checked={p.learned_correction}
            disabled={!correction?.available && !p.learned_correction}
            onChange={(v) => set('learned_correction', v)}
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <SectionTitle onReset={resetFor('factory')}>Fábrica</SectionTitle>
          <EndOfLifeField
            value={p.end_of_life}
            derived={derived.end_of_life}
            source={derived.sources.end_of_life}
            models={defaults.catalog.models}
            onChange={(v) => dispatch({ type: 'setEndOfLife', value: v })}
          />
        </section>

        <Separator />

        <Collapsible className="group/adv space-y-4">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 text-left">
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]/adv:rotate-180" />
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Stock de seguridad
              </span>
            </CollapsibleTrigger>
            {resetSafety && <ResetLink onClick={resetSafety} />}
          </div>
          <CollapsibleContent className="space-y-4">
            <p className="text-xs leading-snug text-muted-foreground">
              El nivel de servicio de cada modelo sale de comparar lo que cuesta faltar (el margen) con lo que
              cuesta sobrar. Cuanto más caro sobrar, menos seguridad.
            </p>
            <SliderField
              label="Meses extra del sobrante"
              unit="m"
              value={p.leftover_extra_months}
              min={0}
              max={6}
              step={0.5}
              decimals={1}
              onChange={(v) => set('leftover_extra_months', v)}
              help="Meses de plan piso (costo financiero mensual de la hoja Economía) que paga una unidad que sobra antes de venderse. Más meses encarecen sobrar y bajan la seguridad."
            />
            <SliderField
              label="Descuento del sobrante"
              unit="%"
              scale={100}
              value={p.leftover_discount}
              min={0}
              max={0.15}
              step={0.005}
              decimals={1}
              onChange={(v) => set('leftover_discount', v)}
              help="Descuento sobre el precio con que se vende una unidad que sobra (política de antigüedad: más de 180 días, 4 %). Los modelos en fin de generación usan su propio descuento de liquidación. Por encima de ~10 % algunos modelos quedan con nivel de servicio menor al 50 % y seguridad negativa."
            />
            <SegmentedField
              label="Meses que cubre la seguridad"
              help="Sobre cuántos meses se mide la incertidumbre de la demanda. «Horizonte»: solo los meses que cubre este pedido. «Hueco + horizonte»: también los meses hasta la llegada, que cubren stock y tránsito; da más seguridad."
              value={p.safety_months}
              options={[
                { value: 'horizon', label: 'Horizonte' },
                { value: 'gap_plus_horizon', label: 'Hueco + horizonte' },
              ]}
              onChange={(v) => set('safety_months', v)}
            />
            <SegmentedField
              label="Variabilidad de la demanda"
              help="Desviación mensual que entra en la seguridad. «Con estacionalidad» usa la demanda ajustada tal cual, así que los picos de diciembre cuentan como variabilidad; «Sin estacionalidad» la quita primero y da menos seguridad."
              value={p.safety_sigma}
              options={[
                { value: 'adjusted', label: 'Con estacionalidad' },
                { value: 'deseasonalized', label: 'Sin estacionalidad' },
              ]}
              onChange={(v) => set('safety_sigma', v)}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {changes.length === 0
            ? 'Valores por defecto'
            : `${changes.length} ${changes.length === 1 ? 'cambio' : 'cambios'} · ${overrideCount} ${overrideCount === 1 ? 'modelo ajustado' : 'modelos ajustados'}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={changes.length === 0}
            onClick={() => dispatch({ type: 'reset' })}
          >
            <RotateCcw />
            Restablecer valores por defecto
          </Button>
          {overrideCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'clearOverrides' })}>
              <Eraser />
              Quitar ajustes por modelo
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
