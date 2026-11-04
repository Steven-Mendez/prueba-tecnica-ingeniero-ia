// Recorrido guiado con driver.js, uno por prototipo (ver tourCaso1.ts y tourCaso2.ts). Cada recorrido va por
// capítulos que viven en pantallas distintas: el capítulo en curso se guarda en el navegador y el shell del caso
// lo retoma al cambiar de sección. El último capítulo termina con un ejercicio (guardar el pedido, registrar un
// resultado) que el shell confirma.
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

import { currentCase, navigate, type CaseId } from '@/hooks/useHashRoute'
import { readStorage, writeStorage } from '@/hooks/useLocalStorage'

export type Step = DriveStep & {
  element?: string
  before?: () => void
  // Pasos del panel de supuestos: el lateral solo existe en pantallas anchas; si no, se señala el botón que lo abre
  panelStep?: 'aside' | 'button'
}

export interface TourChapter {
  title: string
  route: string // ruta dentro del caso (sin el prefijo caso1/caso2)
  steps: Step[]
}

export interface TourDef {
  order: string[]
  chapters: Record<string, TourChapter>
  // Cómo termina el recorrido: el texto del último botón y el control que se pulsa (abre el ejercicio final)
  finish: { label: string; selector: string }
}

// Lo que el recorrido necesita hacer en la pantalla de supuestos (lo registra la página al montarse)
export const tourActions: { openPanel?: () => void; useCurrentWindow?: () => void } = {}

const tours: Partial<Record<CaseId, TourDef>> = {}

export function registerTour(caseId: CaseId, tour: TourDef): void {
  tours[caseId] = tour
}

const key = (caseId: CaseId) => `tour:${caseId}`

export function activeChapter(caseId: CaseId = currentCase()): string | null {
  return readStorage<string>(key(caseId))
}

function setChapter(caseId: CaseId, chapter: string | null) {
  writeStorage(key(caseId), chapter)
}

export function startTour(): void {
  const caseId = currentCase()
  const tour = tours[caseId]
  if (!tour) return
  const first = tour.order[0]
  setChapter(caseId, first)
  navigate(tour.chapters[first].route)
  // Si ya estábamos en esa sección no hay cambio de ruta: se arranca a mano
  window.setTimeout(() => continueTour(first.split('/')[0]), 50)
}

export function stopTour(): void {
  current?.destroy()
  current = null
  setChapter(currentCase(), null)
}

// El shell lo consulta cuando ocurre el ejercicio final: true una sola vez, y limpia el recorrido
export function tourFinished(caseId: CaseId = currentCase()): boolean {
  if (activeChapter(caseId) !== 'final') return false
  setChapter(caseId, null)
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

let current: Driver | null = null

function chapterSteps(tour: TourDef, chapter: string): Step[] {
  let panelShown = false
  return tour.chapters[chapter].steps.filter((s) => {
    if (!s.element) return true
    // Los pasos del panel comprueban su ancla al llegar (el panel se abre con el paso anterior)
    if (s.panelStep) {
      if (panelShown) return false
      const willShow = s.panelStep === 'aside' ? window.innerWidth >= 1024 : true
      if (willShow) panelShown = true
      return willShow
    }
    return visible(s.element) !== null
  })
}

// Retoma el recorrido en la sección que se acaba de abrir, si es el capítulo pendiente
export function continueTour(section: string): void {
  const caseId = currentCase()
  const tour = tours[caseId]
  const chapter = activeChapter(caseId)
  if (!tour || !chapter || chapter === 'final' || chapter !== section) return
  if (current) return
  // El panel de supuestos se abre durante el recorrido: no se espera por él
  const anchors = tour.chapters[chapter].steps
    .filter((s) => s.element && !s.panelStep)
    .map((s) => s.element as string)
  whenReady(anchors, () => run(caseId, tour, chapter))
}

function run(caseId: CaseId, tour: TourDef, chapter: string) {
  const index = tour.order.indexOf(chapter)
  const next = tour.order[index + 1]
  const steps = chapterSteps(tour, chapter)
  const last = steps.length - 1

  const d = driver({
    showProgress: true,
    progressText: `Parte ${index + 1} de ${tour.order.length} · {{current}}/{{total}}`,
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: next ? `Ir a ${tour.chapters[next].title} →` : tour.finish.label,
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
            setChapter(caseId, next)
            navigate(tour.chapters[next].route)
          } else {
            // El ejercicio final: se abre el control y el shell confirma cuando ocurre
            setChapter(caseId, 'final')
            document.querySelector<HTMLElement>(tour.finish.selector)?.click()
          }
        },
      },
    })),
    // Cerrar con la X o Escape abandona el recorrido
    onDestroyStarted: () => {
      if (current) {
        setChapter(caseId, null)
        d.destroy()
        current = null
      }
    },
  })
  current = d
  d.drive()
}
