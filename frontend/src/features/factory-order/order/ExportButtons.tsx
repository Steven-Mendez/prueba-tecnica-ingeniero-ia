import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { downloadCsv } from '@/lib/api'
import type { Parameters } from '../types'

// Los mismos CSV que exporta el notebook (§11), calculados con los parámetros del panel
export function ExportButtons({ parameters }: { parameters: Parameters }) {
  const [busy, setBusy] = useState<'model' | 'version' | null>(null)

  const run = async (table: 'model' | 'version') => {
    setBusy(table)
    try {
      const name = await downloadCsv(table, parameters)
      toast.success(`Descargado ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(['model', 'version'] as const).map((table) => (
        <Button key={table} variant="outline" size="sm" disabled={busy !== null} onClick={() => run(table)}>
          {busy === table ? <Loader2 className="animate-spin" /> : <Download />}
          CSV por {table === 'model' ? 'modelo' : 'versión'}
        </Button>
      ))}
    </div>
  )
}
