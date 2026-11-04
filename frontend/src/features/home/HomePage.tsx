import { ArrowRight, ClipboardList, Compass, FileSpreadsheet, Sparkles, Target, TrendingUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/features/app/PageHeader'
import { startTour } from '@/features/app/tour'
import { date } from '@/lib/format'
import type { DataStatus } from '@/features/data/types'

const SECTIONS = [
  {
    href: '#/caso1/seguimiento',
    icon: Target,
    title: 'Seguimiento',
    text: 'Qué tan bien acierta la herramienta en las ventanas pasadas y los pedidos guardados.',
  },
  {
    href: '#/caso1/planificador',
    icon: ClipboardList,
    title: 'Planificador',
    text: 'Crear el pedido a fábrica: la propuesta, los supuestos, los ajustes por modelo y el paquete final.',
  },
  {
    href: '#/caso1/ventas',
    icon: TrendingUp,
    title: 'Ventas',
    text: 'Venta y venta perdida por mes, modelo, sucursal y tipo de cliente.',
  },
  {
    href: '#/caso1/datos',
    icon: FileSpreadsheet,
    title: 'Datos',
    text: 'Cada hoja del Excel del caso, ya limpia, con búsqueda y filtros.',
  },
  {
    href: '#/caso1/asistente',
    icon: Sparkles,
    title: 'Asistente',
    text: 'Pregunta en lenguaje natural: el agente consulta el motor, compara escenarios, grafica y cambia los supuestos.',
  },
]

// Página de inicio: saludo a quien revisa la prueba y arranque del recorrido guiado
export default function HomePage({ status }: { status: DataStatus | null }) {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Inicio' }]} />
      <div className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-4xl space-y-8 py-4 md:py-10">
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Prueba técnica · Ingeniero IA · Casa Pellas</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Hola, te damos la bienvenida.</h1>
            <p className="max-w-2xl text-base text-muted-foreground">
              Esto es un <span className="text-foreground">prototipo de herramienta para crear el pedido a fábrica de
              forma óptima con los datos disponibles</span>: responde cuántas unidades de cada modelo pedir en cada
              ventana, por ejemplo la que cierra el 30 de octubre de 2026. Propone el pedido a partir de las ventas, el inventario, los
              leads perdidos y los pedidos en tránsito, balanceando el costo de quedarse sin stock con el de sobrar;
              quien planifica lo revisa, lo ajusta con lo que los datos no saben y lo guarda.
            </p>
            <p className="max-w-2xl text-base text-muted-foreground">
              El recorrido guiado pasa por las cuatro pantallas y termina con el ejercicio completo: crear y guardar
              el pedido de octubre. Dura unos cinco minutos.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="lg" onClick={startTour}>
                <Compass />
                Empezar el recorrido guiado
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="#/caso1/planificador">
                  Ir directo al planificador
                  <ArrowRight />
                </a>
              </Button>
            </div>
            {status && (
              <p className="text-xs text-muted-foreground">
                Fuente: {status.file_name} · datos al {date(status.data_cutoff)}. Todos los datos son ficticios.
              </p>
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
