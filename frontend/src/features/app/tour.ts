// Recorrido guiado por toda la app con driver.js, en cuatro partes: Seguimiento → Ventas → Datos → Planificador.
// Termina con el ejercicio de crear y guardar el pedido de la ventana actual. Como cada parte vive en una pantalla
// distinta, el capítulo en curso se guarda en el navegador y App lo retoma al cambiar de sección.
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

import { navigate } from '@/hooks/useHashRoute'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'

const KEY = 'tour:chapter'

export type Chapter = 'seguimiento' | 'ventas' | 'datos' | 'planificador' | 'final'
const ORDER: Exclude<Chapter, 'final'>[] = ['seguimiento', 'ventas', 'datos', 'planificador']
const ROUTE: Record<Chapter, string> = {
  seguimiento: 'seguimiento',
  ventas: 'ventas',
  datos: 'datos/orders',
  planificador: 'planificador/pedido',
  final: 'planificador/pedido',
}

// Lo que el recorrido necesita hacer en el planificador (lo registra PlannerPage al montarse)
export const tourActions: { openPanel?: () => void; useCurrentWindow?: () => void } = {}

export function activeChapter(): Chapter | null {
  return readStorage<Chapter>(KEY)
}

function setChapter(chapter: Chapter | null) {
  writeStorage(KEY, chapter)
}

export function startTour(): void {
  setChapter('seguimiento')
  navigate(ROUTE.seguimiento)
  // Si ya estábamos en Seguimiento no hay cambio de ruta: se arranca a mano
  window.setTimeout(() => continueTour('seguimiento'), 50)
}

export function stopTour(): void {
  current?.destroy()
  current = null
  setChapter(null)
}

export function tourFinished(): boolean {
  if (activeChapter() !== 'final') return false
  setChapter(null)
  return true
}

const visible = (selector: string): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(selector)
  return el && el.offsetParent !== null ? el : null
}

// Espera (hasta 10 s) a que la pantalla haya cargado todas sus anclas antes de arrancar el capítulo; si alguna
// no llega (p. ej. una tarjeta que no aplica), arranca igual con las que haya
function whenReady(selectors: string[], run: () => void, tries = 50) {
  if (selectors.every(visible) || (tries === 0 && selectors.some(visible))) return run()
  if (tries > 0) window.setTimeout(() => whenReady(selectors, run, tries - 1), 200)
}

type Step = DriveStep & { element?: string; before?: () => void }

const CHAPTERS: Record<Exclude<Chapter, 'final'>, { title: string; steps: Step[] }> = {
  seguimiento: {
    title: 'Seguimiento',
    steps: [
      {
        popover: {
          title: 'Parte 1 · ¿Qué tan bien acierta la herramienta?',
          description:
            'Antes de pedir, conviene saber cuánto se puede confiar en la propuesta. Seguimiento compara, en cada ventana pasada, lo que la herramienta proyectó con lo que de verdad pasó.',
        },
      },
      {
        element: '[data-tour="tracking-kpis"]',
        popover: {
          title: 'Las tres cifras',
          description:
            'Ciclos medidos (ventanas con horizonte ya completo), error del pronóstico (cuánto se desvía la demanda proyectada de la real) y sesgo (si tiende a proyectar de más o de menos).',
        },
      },
      {
        element: '[data-tour="tracking-charts"]',
        popover: {
          title: 'Ventana por ventana',
          description:
            'A la izquierda, demanda proyectada frente a la real de cada ciclo. A la derecha, el pedido que habría propuesto la herramienta frente al que se hizo de verdad.',
        },
      },
      {
        element: '[data-tour="tracking-models"]',
        popover: {
          title: 'Por modelo y corrección aprendida',
          description:
            'Qué modelos se proyectan de más o de menos. La corrección aprendida usa ese sesgo para ajustar la demanda de cada modelo en el planificador, si decides activarla.',
        },
      },
      {
        element: '[data-tour="tracking-plans"]',
        popover: {
          title: 'Pedidos guardados',
          description:
            'Aquí aparecerá el pedido de octubre que vas a crear al final del recorrido, y se irá comparando con la demanda real a medida que lleguen los meses.',
        },
      },
    ],
  },
  ventas: {
    title: 'Ventas',
    steps: [
      {
        popover: {
          title: 'Parte 2 · De dónde sale la demanda',
          description:
            'La propuesta de pedido parte de lo que se vendió y de lo que no se pudo vender por falta de stock. Esta pantalla lo muestra con filtros por periodo, modelo, sucursal y tipo de cliente.',
        },
      },
      {
        element: '[data-tour="sales-kpis"]',
        popover: {
          title: 'Venta y venta perdida',
          description:
            'Unidades netas e ingresos del periodo, y la venta perdida por disponibilidad: clientes que no compraron porque el modelo estaba agotado. Esa venta perdida se recupera en la demanda del planificador.',
        },
      },
      {
        element: '[data-tour="sales-monthly"]',
        popover: {
          title: 'Venta por mes',
          description:
            'La curva del año: diciembre pesa mucho más que enero. El planificador usa esa estacionalidad para la demanda de cada tramo del ciclo.',
        },
      },
    ],
  },
  datos: {
    title: 'Datos',
    steps: [
      {
        popover: {
          title: 'Parte 3 · Los datos de origen',
          description:
            'Todo sale de las hojas del Excel del caso, ya limpias: ventas, inventario, leads, pedidos a fábrica, economía por modelo y comunicados. En producción las alimentaría el ETL.',
        },
      },
      {
        element: '[data-tour="data-sheet"]',
        popover: {
          title: 'La hoja Pedidos',
          description:
            'De aquí salen el tránsito (lo que ya viene en camino), el lead time observado y las llegadas tardías. Cada hoja se puede buscar, filtrar y ordenar.',
        },
      },
    ],
  },
  planificador: {
    title: 'Planificador',
    steps: [
      {
        popover: {
          title: 'Parte 4 · El ejercicio: crear el pedido de la ventana actual',
          description:
            'Ahora sí: vamos a armar el paquete que se pedirá a fábrica. La app ya trae una propuesta; tú la revisas, ajustas lo que haga falta y la guardas.',
        },
      },
      {
        element: '[data-tour="window"]',
        before: () => tourActions.useCurrentWindow?.(),
        popover: {
          title: '1 · La ventana',
          description:
            'Déjala en la ventana actual. Las siguientes se planifican después, con lo que guardes ahora contando como tránsito.',
        },
      },
      {
        element: '[data-tour="steps"]',
        popover: {
          title: 'Los cuatro pasos',
          description:
            'Ventana, supuestos, ajustes por modelo y paquete a pedir. A la derecha ves el total propuesto y si ya se guardó un pedido para esta ventana.',
        },
      },
      {
        element: '[data-tour="kpis"]',
        popover: {
          title: 'La propuesta en cifras',
          description:
            'Unidades a pedir, capital comprometido, modelos con pedido y la venta que no se podrá atender antes de que llegue el pedido. Cada cifra tiene su ⓘ.',
        },
      },
      {
        element: '[data-tour="order-chart"]',
        popover: {
          title: 'Qué cubre el pedido',
          description:
            'Por modelo: lo que ya habrá al llegar (gris), lo que se pide (azul) y lo que hay que cubrir (punto). La raya es el pedido de la ventana anterior.',
        },
      },
      {
        element: '[data-tour="params-panel"]',
        before: () => tourActions.openPanel?.(),
        popover: {
          title: '2 · Los supuestos',
          description:
            'Lead time, llegadas tardías, demanda y seguridad vienen de los datos («auto»). Puedes mover alguno y ver el pedido recalcularse; «Restablecer» vuelve a los valores por defecto. Para el ejercicio, déjalos como están.',
        },
      },
      {
        element: '[data-tour="params-button"]',
        popover: {
          title: '2 · Los supuestos',
          description:
            'Este botón abre los supuestos (lead time, demanda, seguridad). Para el ejercicio, déjalos como están.',
        },
      },
      {
        element: '[data-tour="order-table"]',
        popover: {
          title: '3 · Ajustes por modelo',
          description:
            'La app recomienda la cantidad de cada modelo, pero mandas tú: escribe otra en la columna Pedido (por ejemplo 500 Hilux) y queda fijada a mano, con la recomendación debajo para volver. La flecha abre cómo se llega a la cifra.',
        },
      },
      {
        element: '[data-tour="export"]',
        popover: {
          title: 'Exportar',
          description: 'El pedido en CSV, por modelo y por versión, para enviarlo o revisarlo en Excel.',
        },
      },
      {
        element: '[data-tour="save"]',
        popover: {
          title: '4 · Guardar el pedido',
          description:
            'Último paso. Al pulsar «Guardar pedido» se abre el formulario: ponle nombre, una nota si quieres, y guarda. Con eso queda creado el pedido de la ventana y el recorrido termina.',
        },
      },
    ],
  },
}

let current: Driver | null = null

function chapterSteps(chapter: Exclude<Chapter, 'final'>): Step[] {
  let panelShown = false
  return CHAPTERS[chapter].steps.filter((s) => {
    if (!s.element) return true
    // Los pasos del panel comprueban su ancla al llegar (el panel se abre con el paso anterior)
    if (s.element.includes('params-')) {
      if (panelShown) return false
      const willShow = s.element.includes('panel') ? window.innerWidth >= 1024 : true
      if (willShow) panelShown = true
      return willShow
    }
    return visible(s.element) !== null
  })
}

// Retoma el recorrido en la sección que se acaba de abrir, si es el capítulo pendiente
export function continueTour(section: string): void {
  const chapter = activeChapter()
  if (!chapter || chapter === 'final' || chapter !== section) return
  if (current) return
  const pending: Exclude<Chapter, 'final'> = chapter
  // El panel de parámetros se abre durante el recorrido: no se espera por él
  const anchors = CHAPTERS[pending].steps
    .filter((s) => s.element && !s.element.includes('params-'))
    .map((s) => s.element as string)
  whenReady(anchors, () => run(pending))
}

function run(chapter: Exclude<Chapter, 'final'>) {
  const index = ORDER.indexOf(chapter)
  const next = ORDER[index + 1]
  const steps = chapterSteps(chapter)
  const last = steps.length - 1

  const d = driver({
    showProgress: true,
    progressText: `Parte ${index + 1} de ${ORDER.length} · {{current}}/{{total}}`,
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: next ? `Ir a ${CHAPTERS[next].title} →` : 'Guardar pedido',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: 'planner-tour',
    steps: steps.map((s, i) => ({
      ...s,
      onHighlightStarted: () => s.before?.(),
      popover: {
        ...s.popover,
        onNextClick: () => {
          if (i < last) {
            // El paso siguiente puede necesitar preparar la pantalla (abrir el panel, fijar la ventana)
            steps[i + 1].before?.()
            window.setTimeout(() => d.moveNext(), steps[i + 1].before ? 250 : 0)
            return
          }
          d.destroy()
          current = null
          if (next) {
            setChapter(next)
            navigate(ROUTE[next])
          } else {
            // El ejercicio termina guardando el pedido: se abre el formulario y App confirma al guardar
            setChapter('final')
            document.querySelector<HTMLElement>('[data-tour="save"]')?.click()
          }
        },
      },
    })),
    // Cerrar con la X o Escape abandona el recorrido
    onDestroyStarted: () => {
      if (current) {
        setChapter(null)
        d.destroy()
        current = null
      }
    },
  })
  current = d
  d.drive()
}
