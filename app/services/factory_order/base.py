"""Estructuras compartidas por la limpieza y el modelo."""

from dataclasses import dataclass, field, replace

import pandas as pd

from app.services.common.errors import DataError  # noqa: F401 - el error es común a los dos casos


@dataclass(frozen=True)
class CleanBase:
    """Base limpia: las mismas tablas que `00_limpieza` guarda en `data/processed/caso1_limpio.pkl`.

    Las columnas conservan los nombres del Excel (en español) porque son los datos de entrada; las columnas
    que agrega la limpieza (`month`, `special_fleet`, …) llevan los mismos nombres que en el notebook.
    Ninguna función del motor modifica estas tablas: se comparten entre peticiones.
    """

    models: list[str]
    sales: pd.DataFrame
    base_sales: pd.DataFrame
    inventory: pd.DataFrame
    leads: pd.DataFrame
    orders: pd.DataFrame
    economics: pd.DataFrame  # índice: Modelo
    communications: pd.DataFrame
    rules: pd.DataFrame  # índice: Modelo; columnas min_order, lot_multiple
    data_cutoff: pd.Timestamp  # última foto de inventario

    def as_of(self, cutoff: pd.Timestamp) -> "CleanBase":
        """Lo que se sabía a la fecha de corte: permite recalcular un ciclo pasado (validación histórica).

        Con el corte de los datos no filtra nada, así que reproduce exactamente el notebook.
        """
        if cutoff >= self.data_cutoff:
            return self
        orders = self.orders[self.orders["Fecha pedido"] <= cutoff].copy()
        received = orders["Fecha de recepción"] <= cutoff
        orders["Estado"] = orders["Estado"].where(received, "En tránsito").where(~received, "Recibido")
        orders["Fecha de recepción"] = orders["Fecha de recepción"].where(received)
        sales = self.sales[self.sales["Fecha"] <= cutoff]
        return replace(
            self,
            sales=sales,
            base_sales=self.base_sales[self.base_sales["Fecha"] <= cutoff],
            inventory=self.inventory[self.inventory["month"] <= cutoff.to_period("M")],
            leads=self.leads[self.leads["Fecha cierre"] <= cutoff],
            orders=orders,
            communications=self.communications[self.communications["Fecha"] <= cutoff],
            data_cutoff=cutoff,
        )


@dataclass(frozen=True)
class CleaningChange:
    sheet: str
    column: str
    variants_before: int
    variants_after: int
    cells_changed: int


@dataclass(frozen=True)
class QualityIssue:
    sheet: str
    issue: str
    rows: str
    treatment: str


@dataclass(frozen=True)
class CleaningSummary:
    """Lo que hizo la limpieza: se muestra al subir un Excel para que el planificador lo revise."""

    sheets: dict[str, int]
    period_start: pd.Timestamp
    period_end: pd.Timestamp
    suggested_cutoff: pd.Timestamp
    changes: list[CleaningChange]
    quality: list[QualityIssue]
    reconciliation_differences: int
    reconciliation_cells: int
    warnings: list[str] = field(default_factory=list)
