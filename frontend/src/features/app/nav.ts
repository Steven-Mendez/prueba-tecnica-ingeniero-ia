import {
  ClipboardList,
  Gauge,
  Home,
  ListChecks,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import type { CaseId } from '@/hooks/useHashRoute'

export interface NavItem {
  section: string
  title: string
  icon: LucideIcon
  hint: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export interface CaseNav {
  brand: string // subtítulo bajo «Casa Pellas» en el sidebar
  title: string // nombre del prototipo
  groups: NavGroup[]
  shortLabels: Record<string, string> // nombres cortos de las hojas en el grupo Datos
  assistantHint: string
  hasTour: boolean
}

// Menú de cada prototipo. Las rutas son #/<caso>/<section>.
export const NAV_BY_CASE: Record<CaseId, CaseNav> = {
  caso1: {
    brand: 'Planificador de pedidos',
    title: 'Caso 1 · Pedido a fábrica',
    groups: [
      { label: 'Empezar', items: [{ section: 'inicio', title: 'Inicio', icon: Home, hint: 'Bienvenida y recorrido guiado' }] },
      {
        label: 'Planificación',
        items: [
          { section: 'seguimiento', title: 'Seguimiento', icon: Target, hint: 'Precisión y pedidos guardados' },
          { section: 'planificador', title: 'Planificador', icon: ClipboardList, hint: 'Crear el pedido a fábrica' },
        ],
      },
      {
        label: 'Análisis',
        items: [
          { section: 'ventas', title: 'Ventas', icon: TrendingUp, hint: 'Ventas, pérdidas y tendencias' },
          { section: 'asistente', title: 'Asistente', icon: Sparkles, hint: 'Pregunta, compara escenarios, pide gráficos' },
        ],
      },
    ],
    shortLabels: { orders: 'Pedidos', economics: 'Economía' },
    assistantHint: 'Asistente: pregunta, compara escenarios, pide gráficos',
    hasTour: true,
  },
  caso2: {
    brand: 'Cola de renovaciones',
    title: 'Caso 2 · Renovaciones',
    groups: [
      { label: 'Empezar', items: [{ section: 'inicio', title: 'Inicio', icon: Home, hint: 'Qué hace el prototipo' }] },
      {
        label: 'Operación',
        items: [
          { section: 'cola', title: 'Cola del día', icon: ListChecks, hint: 'A quién llamar hoy y registrar el resultado' },
          { section: 'panel', title: 'Panel del jefe', icon: Gauge, hint: 'Canales, capacidad y métricas del piloto' },
        ],
      },
      {
        label: 'Análisis',
        items: [
          { section: 'supuestos', title: 'Supuestos y simulación', icon: SlidersHorizontal, hint: 'Apertura, capacidad e impacto' },
          { section: 'asistente', title: 'Asistente', icon: Sparkles, hint: 'Pregunta por la cola, simula, redacta mensajes' },
        ],
      },
    ],
    shortLabels: { calls: 'Bitácora', renewals: 'Renovaciones', team: 'Equipo' },
    assistantHint: 'Asistente: pregunta por la cola, simula supuestos, redacta mensajes',
    hasTour: true,
  },
}
