import { ClipboardList, FileSpreadsheet, Home, Sparkles, Target, TrendingUp } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { num0 } from '@/lib/format'
import type { DataStatus } from '@/features/data/types'

interface Props {
  section: string
  sub: string | null
  status: DataStatus | null
}

const NAV = [
  {
    label: 'Empezar',
    items: [{ section: 'inicio', title: 'Inicio', icon: Home, hint: 'Bienvenida y recorrido guiado' }],
  },
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
] as const

// Nombres cortos de las hojas para el sidebar (el nombre completo va en la página de cada hoja)
const SHORT_LABELS: Record<string, string> = {
  orders: 'Pedidos',
  economics: 'Economía',
}

export function AppSidebar({ section, sub, status }: Props) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#/inicio">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  CP
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Casa Pellas</span>
                  <span className="truncate text-xs text-muted-foreground">Planificador de pedidos</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent data-tour="nav">
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton asChild isActive={section === item.section} tooltip={item.title}>
                    <a href={`#/${item.section}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Datos</SidebarGroupLabel>
          <SidebarMenu>
            {(status?.sheets ?? []).map((sheet, i) => (
              <SidebarMenuItem key={sheet.key}>
                <SidebarMenuButton
                  asChild
                  // #/datos sin hoja abre la primera
                  isActive={section === 'datos' && (sub === sheet.key || (!sub && i === 0))}
                  tooltip={`${sheet.label} · ${num0(sheet.clean_rows)} filas`}
                >
                  <a href={`#/datos/${sheet.key}`}>
                    <FileSpreadsheet />
                    <span>{SHORT_LABELS[sheet.key] ?? sheet.label}</span>
                  </a>
                </SidebarMenuButton>
                <SidebarMenuBadge className="font-normal text-muted-foreground tabular-nums">
                  {num0(sheet.clean_rows)}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
