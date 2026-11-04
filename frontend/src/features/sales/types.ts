// Tipos espejo de app/schemas/sales.py (tablero de ventas).

export interface SalesFilters {
  date_from: string
  date_to: string
  models: string[]
  branches: string[]
  customer_types: string[]
  include_fleet: boolean
}

export interface SalesOptions {
  models: string[]
  branches: string[]
  customer_types: string[]
  min_date: string
  max_date: string
}

export interface SalesKpis {
  units: number
  revenue_usd: number
  avg_price_usd: number | null
  invoices: number
  credit_notes: number
  lost_units: number
  fleet_units: number
  units_prev_year: number | null
  revenue_prev_year: number | null
}

export interface SalesMonth {
  month: string
  units: number
  revenue_usd: number
  lost_units: number
  units_prev_year: number | null
}

export interface SalesGroup {
  key: string
  label: string
  units: number
  revenue_usd: number
  share: number
  units_prev_year: number | null
}

export interface SalesOverview {
  data_version: string
  filters: SalesFilters
  options: SalesOptions
  kpis: SalesKpis
  monthly: SalesMonth[]
  by_model: SalesGroup[]
  by_branch: SalesGroup[]
  by_customer_type: SalesGroup[]
  top_versions: SalesGroup[]
  top_sellers: SalesGroup[]
}

// Filtros que elige el usuario (null en las fechas = el periodo por defecto del servidor)
export interface SalesQuery {
  date_from: string | null
  date_to: string | null
  models: string[]
  branches: string[]
  customer_types: string[]
  include_fleet: boolean
}
