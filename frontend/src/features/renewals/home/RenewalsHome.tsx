import { AlertCircle, ArrowRight, Compass, FileSpreadsheet, Gauge, ListChecks, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/features/app/PageHeader'
import { startTour } from '@/features/app/tour'
import { date, num0 } from '@/lib/format'
import type { RenewalsCtx } from '../Caso2Shell'

const SECTIONS = [
  {
    href: '#/caso2/cola',
    icon: ListChecks,
    title: 'Cola del día',
    text: 'Lo que vería cada gestor por la mañana: pólizas pendientes de primer contacto, ordenadas por fecha límite y valor, con el registro del resultado de cada llamada.',
  },
  {
    href: '#/caso2/panel',
    icon: Gauge,
    title: 'Panel del jefe',
    text: 'Qué entra hoy por cada canal, capacidad frente a carga, primeros contactos en ventana por gestor y los indicadores del piloto.',
  },
  {
    href: '#/caso2/supuestos',
    icon: SlidersHorizontal,
    title: 'Supuestos y simulación',
    text: 'Apertura a 14 o 12 días, fecha límite, capacidad y meta del piloto: la simulación día a día y el rango de comisión adicional.',
  },
  {
    href: '#/caso2/datos',
    icon: FileSpreadsheet,
    title: 'Datos',
    text: 'Las tres hojas del Excel del caso, ya limpias, con búsqueda y filtros por gestor.',
  },
  {
    href: '#/caso2/asistente',
    icon: Sparkles,
    title: 'Asistente',
    text: 'Pregunta a quién llamar primero y por qué, simula otra capacidad, pide el mensaje del canal automático o registra un resultado.',
  },
]

// Inicio del Caso 2: qué hace el prototipo y por dónde entrar
export default function RenewalsHome({ ctx, error, onRetry }: { ctx: RenewalsCtx; error: string | null; onRetry: () => void }) {
  const { status } = ctx
  return (
    <>
      <PageHeader crumbs={[{ label: 'Caso 2 · Renovaciones' }, { label: 'Inicio' }]} />
      <div className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-4xl space-y-8 py-4 md:py-10">
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Prueba técnica · Ingeniero IA · Casa Pellas · Caso 2</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">La cola de renovaciones de Capesa.</h1>
            <p className="max-w-2xl text-base text-muted-foreground">
              Desde diciembre de 2025 el primer contacto ocurre a 3 días del vencimiento en lugar de 16 y la
              renovación cayó de 62 % a 51 %. Este prototipo aplica{' '}
              <span className="text-foreground">tres reglas sin contratar</span>: enruta cada póliza por canal
              (automático, corrección de datos o cola telefónica), abre cada expediente 14 días antes del vencimiento
              y ordena la cola por fecha límite y por comisión × mejora esperada. Reproduce el notebook del análisis
              y deja operar la cola del día, registrar resultados y mover los supuestos.
            </p>
            <p className="max-w-2xl text-base text-muted-foreground">
              El recorrido guiado pasa por el panel del jefe y la simulación y termina en la cola del día con el
              ejercicio completo: registrar el resultado de la primera llamada. Dura unos cuatro minutos.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="lg" onClick={startTour}>
                <Compass />
                Empezar el recorrido guiado
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="#/caso2/cola">
                  Ir directo a la cola del día
                  <ArrowRight />
                </a>
              </Button>
            </div>
            {status && (
              <p className="text-xs text-muted-foreground">
                Fuente: {status.file_name} · {num0(status.policies)} pólizas con vencimiento entre {date(status.period_start)} y{' '}
                {date(status.period_end)} · {num0(status.calls)} llamadas en la bitácora · 5 gestores desde{' '}
                {date(status.staffing_change_date)}. Todos los datos son ficticios.
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>No se pudo leer la fuente del Caso 2</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCw />
                    Reintentar
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <a key={s.href} href={s.href} className="group">
                <Card className="h-full transition-colors group-hover:bg-accent/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <s.icon className="size-4 text-muted-foreground" aria-hidden />
                      {s.title}
                    </CardTitle>
                    <CardDescription>{s.text}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">Abrir →</CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
