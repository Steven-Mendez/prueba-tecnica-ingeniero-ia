import type { Dispatch } from 'react'

import { SectionTitle, SliderField } from '@/components/fields'
import { Separator } from '@/components/ui/separator'
import { num0, pct } from '@/lib/format'
import type { Derived, Parameters } from '../types'
import { SECTION_FIELDS, sectionChanged, type RenewalParametersAction } from './state'

interface Props {
  base: Parameters
  parameters: Parameters
  derived: Derived
  dispatch: Dispatch<RenewalParametersAction>
}

// Panel de supuestos del prototipo (S2.11, S2.14–S2.16). Cada control explica qué mueve en la simulación.
export function AssumptionsPanel({ base, parameters: p, derived, dispatch }: Props) {
  const resetFor = (section: keyof typeof SECTION_FIELDS) =>
    sectionChanged(base, p, SECTION_FIELDS[section]) ? () => dispatch({ type: 'resetFields', fields: [...SECTION_FIELDS[section]] }) : undefined
  const set = <K extends keyof Parameters>(field: K, value: Parameters[K]) => dispatch({ type: 'set', field, value })

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-x-hidden overflow-y-auto pr-2 pb-4">
        <section className="space-y-4">
          <SectionTitle onReset={resetFor('window')}>Apertura y fecha límite</SectionTitle>
          <SliderField
            label="Apertura del expediente"
            unit="d"
            value={p.open_days}
            min={5}
            max={30}
            step={1}
            onChange={(v) => set('open_days', Math.round(v))}
            help="Días antes del vencimiento en que la póliza entra a la cola telefónica (S2.16). Hoy la práctica es ~3 días; el notebook propone 14 y sugiere probar 12 en el piloto."
            hint="Hoy: mediana de 3 días · estándar de la empresa: 20 días"
          />
          <SliderField
            label="Fecha límite del primer contacto"
            unit="d"
            value={p.deadline_days}
            min={0}
            max={20}
            step={1}
            onChange={(v) => set('deadline_days', Math.round(v))}
            help="Días antes del vencimiento en que una póliza debería tener su primer contacto. Con 8 coincide con el fin de la ventana 8–14 que más renueva. La cola se ordena por días para esta fecha."
          />
          <SliderField
            label="Gracia tras el vencimiento"
            unit="d"
            value={p.grace_days}
            min={0}
            max={30}
            step={1}
            onChange={(v) => set('grace_days', Math.round(v))}
            help="Hasta cuántos días después del vencimiento se sigue intentando el primer contacto antes de dar la póliza por caducada."
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <SectionTitle onReset={resetFor('capacity')}>Capacidad</SectionTitle>
          <SliderField
            label="Llamadas del equipo por día"
            value={p.daily_capacity}
            min={50}
            max={500}
            step={5}
            onChange={(v) => set('daily_capacity', Math.round(v))}
            help="Capacidad del equipo por día hábil (S2.11). Los seguimientos de cada póliza consumen capacidad antes que los primeros contactos. Con 250 = 5 gestores × 50."
            hint={`${num0(Math.round(p.daily_capacity / Math.max(p.agents, 1)))} por gestor · meta de la hoja Equipo: ${derived.daily_call_target}`}
          />
          <SliderField
            label="Gestores"
            value={p.agents}
            min={1}
            max={12}
            step={1}
            onChange={(v) => set('agents', Math.round(v))}
            help="Cuántos gestores reparten la cola. No cambia la capacidad (va arriba): fija la capacidad por gestor y el tamaño del piloto por gestor y mes."
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <SectionTitle onReset={resetFor('impact')}>Impacto</SectionTitle>
          <SliderField
            label="Meta del piloto en ventana"
            unit="%"
            scale={100}
            value={p.target_window_share}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => set('target_window_share', v)}
            help="Porcentaje de primeros contactos en la ventana 8–14 que el piloto se propone alcanzar. La ganancia «meta» interpola entre lo de hoy y el techo de la simulación."
          />
          <SliderField
            label="Renovación del canal automático"
            unit="%"
            scale={100}
            value={p.automatic_channel_rate ?? derived.observed_automatic_rate}
            min={0.5}
            max={1}
            step={0.01}
            onChange={(v) => set('automatic_channel_rate', v)}
            auto={p.automatic_channel_rate === null}
            onAuto={() => set('automatic_channel_rate', null)}
            help="Tasa esperada de domiciliadas, financiadas y flotas sin llamada (S2.14). Auto: la observada con llamada. Si fuera menor, el ajuste mensual se muestra aparte del rango de impacto."
            hint={`Observado con llamada: ${pct(derived.observed_automatic_rate)}`}
          />
        </section>
      </div>
    </div>
  )
}
