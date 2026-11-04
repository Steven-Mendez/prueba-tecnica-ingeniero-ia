import { Fragment, type ReactNode } from 'react'

import { CircleHelp, Sparkles } from 'lucide-react'

import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { currentCase } from '@/hooks/useHashRoute'
import { NAV_BY_CASE } from './nav'
import { startTour } from './tour'
import { agent, useAgentState } from '@/features/agent/agentStore'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

export interface Crumb {
  label: string
  href?: string
}

// Encabezado de cada página dentro del inset: abrir/cerrar el sidebar, migas y acciones de la página
export function PageHeader({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) {
  const assistant = useAgentState()
  const nav = NAV_BY_CASE[currentCase()]
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => (
            <Fragment key={c.label}>
              {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={i < crumbs.length - 1 ? 'hidden md:block' : 'min-w-0'}>
                {i < crumbs.length - 1 && c.href ? (
                  <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={assistant.open ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={agent.toggle}
              aria-label="Asistente"
              aria-pressed={assistant.open}
              data-tour="assistant-button"
            >
              <Sparkles />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {assistant.status?.enabled ? nav.assistantHint : 'Asistente (sin clave de API configurada)'}
          </TooltipContent>
        </Tooltip>
        {nav.hasTour && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={startTour} aria-label="Recorrido guiado">
                <CircleHelp />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Recorrido guiado</TooltipContent>
          </Tooltip>
        )}
        <ThemeToggle />
      </div>
    </header>
  )
}
