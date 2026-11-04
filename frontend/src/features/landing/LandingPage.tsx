import { ArrowRight, ClipboardList, PhoneCall } from 'lucide-react'

import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const CASES = [
  {
    href: '#/caso1/inicio',
    icon: ClipboardList,
    kicker: 'Caso 1',
    title: 'Planificador de pedidos a fábrica',
    text: 'Cuántas unidades de cada modelo pedir en la ventana que cierra el 30 de octubre de 2026: la propuesta, los supuestos, los ajustes por modelo, el seguimiento de ventanas pasadas y un asistente que opera la herramienta.',
    cta: 'Abrir el planificador',
  },
  {
    href: '#/caso2/inicio',
    icon: PhoneCall,
    kicker: 'Caso 2',
    title: 'Cola de renovaciones de Capesa',
    text: 'Con los mismos 5 gestores, qué pólizas se llaman, cuándo y en qué orden: la cola del día por gestor con registro de resultados, el panel del jefe, la simulación con sus supuestos y el impacto en comisión.',
    cta: 'Abrir la cola de renovaciones',
  },
]

// Bienvenida: elige qué prototipo abrir. Cada uno tiene su propio menú y su propio asistente.
export default function LandingPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">CP</div>
          <span className="text-sm font-semibold">Casa Pellas · Prototipos</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Prueba técnica · Ingeniero IA</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Hola, te damos la bienvenida.</h1>
          <p className="text-base text-muted-foreground">
            Aquí viven los dos prototipos de la prueba. Cada uno reproduce exactamente el análisis de sus notebooks y
            deja operar la decisión en pantalla: elige por cuál empezar. Todos los datos son ficticios.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {CASES.map((c) => (
            <Card key={c.href} className="flex flex-col">
              <CardHeader>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.kicker}</p>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <c.icon className="size-5 text-muted-foreground" aria-hidden />
                  {c.title}
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed">{c.text}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild size="lg">
                  <a href={c.href}>
                    {c.cta}
                    <ArrowRight />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
