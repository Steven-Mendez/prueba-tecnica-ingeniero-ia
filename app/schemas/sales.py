"""Esquemas del tablero de ventas. `frontend/src/features/sales/types.ts` los replica."""

from datetime import date

from pydantic import BaseModel, Field


class SalesFilters(BaseModel):
    date_from: date
    date_to: date
    models: list[str]
    branches: list[str]
    customer_types: list[str]
    include_fleet: bool


class SalesOptions(BaseModel):
    models: list[str]
    branches: list[str]
    customer_types: list[str]
    min_date: date
    max_date: date


class SalesKpis(BaseModel):
    units: int = Field(description="Unidades netas (las notas de crédito restan)")
    revenue_usd: float
    avg_price_usd: float | None
    invoices: int
    credit_notes: int
    lost_units: int = Field(description="Leads perdidos por falta de disponibilidad")
    fleet_units: int = Field(description="Unidades de flota especial en el periodo")
    units_prev_year: int | None = Field(description="Mismo periodo un año antes, si está en los datos")
    revenue_prev_year: float | None


class SalesMonth(BaseModel):
    month: str = Field(description="YYYY-MM")
    units: int
    revenue_usd: float
    lost_units: int
    units_prev_year: int | None


class SalesGroup(BaseModel):
    key: str
    label: str
    units: int
    revenue_usd: float
    share: float
    units_prev_year: int | None


class SalesOverview(BaseModel):
    data_version: str
    filters: SalesFilters
    options: SalesOptions
    kpis: SalesKpis
    monthly: list[SalesMonth]
    by_model: list[SalesGroup]
    by_branch: list[SalesGroup]
    by_customer_type: list[SalesGroup]
    top_versions: list[SalesGroup]
    top_sellers: list[SalesGroup]
