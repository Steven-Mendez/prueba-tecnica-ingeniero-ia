// Tipos espejo de app/schemas/data.py: la fuente de datos y el explorador de hojas.

export interface CleaningChange {
  sheet: string
  column: string
  variants_before: number
  variants_after: number
  cells_changed: number
}

export interface QualityIssue {
  sheet: string
  issue: string
  rows: string
  treatment: string
}

export interface SheetInfo {
  key: string
  sheet: string
  label: string
  description: string
  rows: number
  clean_rows: number
  date_column: string | null
  date_from: string | null
  date_to: string | null
}

export interface DataStatus {
  path: string
  file_name: string
  version: string
  loaded_at: string
  modified_at: string
  checked_at: string | null
  check_seconds: number | null // null = se lee una vez (prototipo)
  last_error: string | null
  last_error_at: string | null
  data_cutoff: string
  period_start: string
  period_end: string
  models: string[]
  sheets: SheetInfo[]
  changes: CleaningChange[]
  quality: QualityIssue[]
  reconciliation_differences: number
  reconciliation_cells: number
  warnings: string[]
}

export type ColumnType = 'text' | 'number' | 'money' | 'date' | 'bool'

export interface Column {
  key: string
  label: string
  type: ColumnType
  derived: boolean
}

export interface SheetPage {
  key: string
  sheet: string
  columns: Column[]
  rows: unknown[][]
  total: number
  page: number
  page_size: number
  model_column: string | null
  date_column: string | null
  models: string[]
}

export interface SheetQuery {
  page: number
  page_size: number
  q: string
  model: string | null
  date_from: string | null
  date_to: string | null
  flag: string | null
  sort: string | null
  desc: boolean
}
