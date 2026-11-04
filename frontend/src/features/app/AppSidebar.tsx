import { ArrowLeftRight, FileSpreadsheet } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import type { CaseId } from '@/hooks/useHashRoute'
import { num0 } from '@/lib/format'
import { NAV_BY_CASE } from './nav'
import type { SheetInfo } from '@/features/data/types'

interface Props {
  caseId: CaseId
  section: string
  sub: string | null
  sheets: SheetInfo[] | undefined
}

export function AppSidebar({ caseId, section, sub, sheets }: Props) {
  const nav = NAV_BY_CASE[caseId]
  const other: CaseId = caseId === 'caso1' ? 'caso2' : 'caso1'
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={`#/${caseId}/inicio`}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  CP
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Casa Pellas</span>
                  <span className="truncate text-xs text-muted-foreground">{nav.brand}</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent data-tour="nav">
        {nav.groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton asChild isActive={section === item.section} tooltip={item.title}>
                    <a href={`#/${caseId}/${item.section}`}>
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
            {(sheets ?? []).map((sheet, i) => (
              <SidebarMenuItem key={sheet.key}>
                <SidebarMenuButton
                  asChild
                  // #/<caso>/datos sin hoja abre la primera
                  isActive={section === 'datos' && (sub === sheet.key || (!sub && i === 0))}
                  tooltip={`${sheet.label} · ${num0(sheet.clean_rows)} filas`}
                >
                  <a href={`#/${caseId}/datos/${sheet.key}`}>
                    <FileSpreadsheet />
                    <span>{nav.shortLabels[sheet.key] ?? sheet.label}</span>
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={NAV_BY_CASE[other].title}>
              <a href={`#/${other}/inicio`}>
                <ArrowLeftRight />
                <span className="truncate">Ir a {NAV_BY_CASE[other].title}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
