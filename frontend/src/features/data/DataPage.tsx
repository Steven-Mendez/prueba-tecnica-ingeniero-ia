import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/features/app/PageHeader'
import { SheetExplorer } from './SheetExplorer'
import type { SheetFetcher, SheetInfo } from './types'

interface Props {
  sheet: string | null
  status: { sheets: SheetInfo[] } | null
  version: string | null
  fetchSheet?: SheetFetcher // por defecto, la fuente del Caso 1
}

// Cada hoja del caso por separado. Sin hoja en la ruta (#/<caso>/datos) se abre la primera.
export default function DataPage({ sheet, status, version, fetchSheet }: Props) {
  const info = status?.sheets.find((s) => s.key === sheet) ?? status?.sheets[0]
  return (
    <>
      <PageHeader crumbs={[{ label: 'Datos' }, ...(info ? [{ label: info.label }] : [])]} />
      <div className="flex-1 p-4 md:p-6" data-tour="data-sheet">
        {info ? (
          <SheetExplorer key={info.key} info={info} version={version} fetchSheet={fetchSheet} />
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-16 w-80" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}
      </div>
    </>
  )
}
