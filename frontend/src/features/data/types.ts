// Tipos espejo de app/schemas/data.py: las fuentes de datos y el explorador de hojas.

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

// Lo común a las dos fuentes (SourceStatusBase)
export interface SourceStatus {
  path: string
  file_name: string
  version: string
  loaded_at: string
  modified_at: string
  checked_at: string | null
  check_seconds: number | null // null = se lee una vez (prototipo)
  last_error: string | null
  last_error_at: string | null
  period_start: string
  period_end: string
  sheets: SheetInfo[]
  quality: QualityIssue[]
  warnings: string[]
}

// Fuente del Caso 1
export interface DataStatus extends SourceStatus {
  data_cutoff: string
  models: string[]
  changes: CleaningChange[]
  reconciliation_differences: number
  reconciliation_cells: number
}

// Fuente del Caso 2
export interface RenewalsDataStatus extends SourceStatus {
  staffing_change_date: string
  policies: number
  calls: number
  months: number
  duplicates_removed: number
  invalid_phones: number
  first_contact_filled: number
  renewed_without_closing: number
  late_first_contacts: number
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
  models: string[] // valores del filtro principal (modelos en el Caso 1, gestores en el 2)
  filter_label: string
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

export type SheetFetcher = (key: string, q: SheetQuery, signal?: AbortSignal) => Promise<SheetPage>
