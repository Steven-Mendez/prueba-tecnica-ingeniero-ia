import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Icono de ayuda con la explicación en un tooltip. Los textos viven en src/lib/glossary.ts.
export function Help({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn('inline-flex shrink-0 align-middle text-muted-foreground hover:text-foreground', className)}
          aria-label="Ayuda"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{children}</TooltipContent>
    </Tooltip>
  )
}

// Una métrica o término con su explicación al lado: para cabeceras de tabla, títulos de gráfico e indicadores.
// Así quien no maneja el vocabulario (hueco, posición, nivel de servicio…) lo tiene a un clic.
export function Term({ help, children, className }: { help: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span>{children}</span>
      <Help>{help}</Help>
    </span>
  )
}
