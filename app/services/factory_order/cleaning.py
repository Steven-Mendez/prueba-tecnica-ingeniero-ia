"""Lectura y limpieza del Excel del Caso 1: puerto de `notebooks/caso1/00_limpieza.ipynb`.

Aplica los mismos supuestos (S1.1–S1.6, S1.11) y devuelve la base limpia junto con un resumen de lo que hizo.
Donde el notebook se detiene con un `assert`, aquí se lanza `DataError` con un mensaje para el usuario.
"""

import io
import re
import unicodedata
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from app.services.factory_order.base import (
    CleanBase,
    CleaningChange,
    CleaningSummary,
    DataError,
    QualityIssue,
)

# Parámetros de limpieza (supuestos de 00_limpieza §3)
FLEET_THRESHOLD = 10  # S1.3: líneas con 10 o más unidades son flota especial
PRICE_RATIO_OK = (
    0.5,
    2.0,
)  # S1.4: fuera de este rango frente a la mediana del modelo, el precio está en córdobas
NIO_PER_USD = 36.6  # tipo de cambio aproximado 2024-2026, solo para diagnosticar precios en córdobas
NO_AVAILABILITY_PATTERN = re.compile(r"disponib|stock|inventario|unidades", re.IGNORECASE)  # S1.6
ORDER_WINDOW_MONTHS = (1, 4, 7, 10)  # ventanas trimestrales de pedido (comunicado 2024-02-12)
BRANCHES = ["Managua Central", "Managua Sur", "León", "Chinandega", "Estelí", "Juigalpa", "Matagalpa"]
BRANCH_ALIASES = {"mga sur": "Managua Sur", "mga central": "Managua Central"}

# Hojas y columnas que usa el motor; el resto de columnas se conserva pero no es obligatorio.
REQUIRED_COLUMNS: dict[str, list[str]] = {
    "Ventas": [
        "Fecha",
        "Factura",
        "Sucursal",
        "Tipo de cliente",
        "Modelo",
        "Versión",
        "Color",
        "Unidades",
        "Precio unitario (USD)",
        "Nota",
    ],
    "Inventario": ["Mes (cierre)", "Modelo", "Versión", "Color", "Unidades", "Antigüedad promedio (días)"],
    "Leads": [
        "ID Oportunidad",
        "Fecha creación",
        "Fecha cierre",
        "Sucursal",
        "Modelo de interés",
        "Versión de interés",
        "Unidades",
        "Resultado",
        "Motivo de pérdida",
        "Modelo comprado (si difiere)",
    ],
    "Pedidos": [
        "No. pedido",
        "Fecha pedido",
        "Modelo",
        "Versión",
        "Color",
        "Unidades",
        "Fecha estimada de llegada",
        "Estado",
        "Fecha de recepción",
    ],
    "Economía por modelo": [
        "Modelo",
        "Precio promedio (USD)",
        "Margen bruto %",
        "Costo unitario promedio (USD)",
        "Costo financiero mensual por unidad (USD)",
    ],
    "Comunicados": ["Fecha", "Asunto", "Texto"],
}
DATE_COLUMNS = {
    "Ventas": ["Fecha"],
    "Inventario": ["Mes (cierre)"],
    "Leads": ["Fecha creación", "Fecha cierre"],
    "Pedidos": ["Fecha pedido", "Fecha estimada de llegada", "Fecha de recepción"],
    "Comunicados": ["Fecha"],
}
NUMERIC_COLUMNS = {
    "Ventas": ["Unidades", "Precio unitario (USD)"],
    "Inventario": ["Unidades", "Antigüedad promedio (días)"],
    "Leads": ["Unidades"],
    "Pedidos": ["Unidades"],
    "Economía por modelo": [
        "Precio promedio (USD)",
        "Margen bruto %",
        "Costo unitario promedio (USD)",
        "Costo financiero mensual por unidad (USD)",
    ],
}


def read_excel(source: bytes | Path) -> dict[str, pd.DataFrame]:
    """Lee todas las hojas. Lanza DataError si el archivo no es un .xlsx legible."""
    if isinstance(source, bytes):
        if not source.startswith(b"PK"):
            raise DataError("El archivo no es un Excel .xlsx válido.")
        buffer: io.BytesIO | Path = io.BytesIO(source)
    else:
        if not source.is_file():
            raise DataError(f"No existe el archivo {source}.", status_code=404)
        buffer = source
    try:
        return pd.read_excel(buffer, sheet_name=None)
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as exc:
        raise DataError(f"No se pudo leer el Excel: {exc}") from None


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def collapse_spaces(x):
    return x if pd.isna(x) else " ".join(str(x).split())


def make_model_normalizer(models: list[str]):
    catalog = {m.lower(): m for m in models}

    def normalize_model(x):
        # Quita espacios extra y el prefijo "Toyota", y unifica mayúsculas contra el catálogo
        if pd.isna(x):
            return x
        s = re.sub(r"(?i)^toyota\s+", "", collapse_spaces(x))
        return catalog.get(s.lower(), s)

    return normalize_model


BRANCH_MAP = {strip_accents(b).lower(): b for b in BRANCHES} | BRANCH_ALIASES


def normalize_branch(x):
    if pd.isna(x):
        return x
    return BRANCH_MAP.get(strip_accents(collapse_spaces(x)).lower(), x)


def parse_order_rules(communications: pd.DataFrame) -> pd.DataFrame:
    """Pedido mínimo y múltiplo por modelo, leídos del comunicado de fábrica más reciente que los fija.

    Mismo patrón que el notebook ("Modelo N / M" separados por punto y coma). Devuelve una tabla vacía si no
    hay comunicado de mínimos.
    """
    rules_msgs = communications[communications["Asunto"].str.contains("mínimo", case=False, na=False)]
    empty = pd.DataFrame(columns=["min_order", "lot_multiple"], dtype=int).rename_axis("Modelo")
    if rules_msgs.empty:
        return empty
    text = rules_msgs.sort_values("Fecha")["Texto"].iloc[-1]
    if "múltiplo):" not in text:
        return empty
    body = text.split("múltiplo):")[1]
    pairs = []
    for chunk in re.split(r"[;.]", body):
        m = re.match(r"\s*([A-Za-z][A-Za-z0-9 ]+?)\s+(\d+)\s*/\s*(\d+)\s*$", chunk)
        if m:
            pairs.append(m.groups())
    if not pairs:
        return empty
    rules = pd.DataFrame(pairs, columns=["Modelo", "min_order", "lot_multiple"])
    rules[["min_order", "lot_multiple"]] = rules[["min_order", "lot_multiple"]].astype(int)
    return rules.set_index("Modelo")


def monthly_table(df, model_col, value_col, models, months=None) -> pd.DataFrame:
    # Pivote mes × modelo con ceros donde no hay registro (las hojas solo traen combinaciones con dato)
    t = df.pivot_table(index="month", columns=model_col, values=value_col, aggfunc="sum", fill_value=0)
    t = t.reindex(columns=models, fill_value=0)
    if months is None:
        months = pd.period_range(t.index.min(), t.index.max(), freq="M")
    return t.reindex(months, fill_value=0)


def _check_structure(raw: dict[str, pd.DataFrame]) -> None:
    missing_sheets = [s for s in REQUIRED_COLUMNS if s not in raw]
    if missing_sheets:
        raise DataError(f"Faltan hojas en el Excel: {', '.join(missing_sheets)}.")
    for sheet, columns in REQUIRED_COLUMNS.items():
        missing = [c for c in columns if c not in raw[sheet].columns]
        if missing:
            raise DataError(f"En la hoja «{sheet}» faltan las columnas: {', '.join(missing)}.")
        if raw[sheet].empty and sheet != "Comunicados":
            raise DataError(f"La hoja «{sheet}» está vacía.")
    for sheet, columns in DATE_COLUMNS.items():
        for col in columns:
            if not pd.api.types.is_datetime64_any_dtype(raw[sheet][col]):
                try:
                    raw[sheet][col] = pd.to_datetime(raw[sheet][col])
                except (ValueError, TypeError):
                    raise DataError(f"La columna «{col}» de «{sheet}» debe contener fechas.") from None
    for sheet, columns in NUMERIC_COLUMNS.items():
        for col in columns:
            if not pd.api.types.is_numeric_dtype(raw[sheet][col]):
                raise DataError(f"La columna «{col}» de «{sheet}» debe ser numérica.")


def _dictionary_cutoff(raw: dict[str, pd.DataFrame]) -> pd.Timestamp | None:
    sheet = raw.get("Diccionario")
    if sheet is None:
        return None
    texts = [str(c) for c in sheet.columns] + [str(v) for v in sheet.to_numpy().ravel() if pd.notna(v)]
    for text in texts:
        m = re.search(r"[Ff]echa de corte:\s*(\d{1,2}/\d{1,2}/\d{4})", text)
        if m:
            return pd.to_datetime(m.group(1), dayfirst=True)
    return None


def clean(raw: dict[str, pd.DataFrame]) -> tuple[CleanBase, CleaningSummary]:
    """Limpieza completa de 00_limpieza (celdas 2–24) sobre las hojas ya leídas."""
    raw = {k: v.copy() for k, v in raw.items()}
    _check_structure(raw)
    warnings: list[str] = []

    economics = raw["Economía por modelo"].copy()
    economics["Modelo"] = economics["Modelo"].map(collapse_spaces)
    if economics["Modelo"].isna().any() or economics["Modelo"].duplicated().any():
        raise DataError("La hoja «Economía por modelo» debe tener un modelo distinto por fila.")
    models = economics["Modelo"].tolist()  # catálogo oficial: los modelos de la hoja Economía
    normalize_model = make_model_normalizer(models)

    # Normalización de modelos, versiones, colores y sucursales (celda 7)
    sheets = raw
    log = []

    def apply(sheet, col, fn):
        before = sheets[sheet][col]
        after = before.map(fn)
        changed = int((before.astype(object).fillna("∅") != after.astype(object).fillna("∅")).sum())
        log.append(CleaningChange(sheet, col, int(before.nunique()), int(after.nunique()), changed))
        sheets[sheet][col] = after

    for sheet in ["Ventas", "Inventario", "Pedidos"]:
        apply(sheet, "Modelo", normalize_model)
        for col in ["Versión", "Color"]:
            apply(sheet, col, collapse_spaces)
    for col in ["Modelo de interés", "Modelo comprado (si difiere)"]:
        apply("Leads", col, normalize_model)
    for sheet in ["Ventas", "Leads"]:
        apply(sheet, "Sucursal", normalize_branch)

    for sheet, col in [
        ("Ventas", "Modelo"),
        ("Inventario", "Modelo"),
        ("Pedidos", "Modelo"),
        ("Leads", "Modelo de interés"),
    ]:
        outside = sheets[sheet][col].dropna()
        outside = outside[~outside.isin(models)]
        if not outside.empty:
            ejemplos = ", ".join(f"«{v}» ({n} filas)" for v, n in outside.value_counts().head(5).items())
            raise DataError(
                f"Hay modelos fuera de catálogo en «{sheet}» ({col}): {ejemplos}. "
                "El catálogo es la hoja «Economía por modelo»."
            )
    for sheet in ["Ventas", "Leads"]:
        unknown = set(sheets[sheet]["Sucursal"].dropna()) - set(BRANCHES)
        if unknown:
            warnings.append(
                f"Sucursales no reconocidas en «{sheet}»: {', '.join(sorted(map(str, unknown)))} "
                "(no afectan el pedido, que se calcula por modelo)."
            )

    # Ventas: duplicados, notas de crédito, flotas y precios en córdobas (celdas 9–13)
    raw_v = sheets["Ventas"]
    duplicated_sales = int(raw_v.duplicated().sum())
    sales = raw_v.drop_duplicates().copy()  # S1.1
    sales["is_credit_note"] = sales["Factura"].astype(str).str.startswith("NC")  # S1.2
    sales["special_fleet"] = sales["Unidades"] >= FLEET_THRESHOLD  # S1.3
    model_median = sales.groupby("Modelo")["Precio unitario (USD)"].transform("median")
    sales["price_ratio"] = sales["Precio unitario (USD)"] / model_median
    sales["price_in_cordobas"] = ~sales["price_ratio"].between(*PRICE_RATIO_OK)  # S1.4
    sales["price_usd"] = sales["Precio unitario (USD)"].where(~sales["price_in_cordobas"])
    sales["price_usd_converted"] = sales["price_usd"].fillna(sales["Precio unitario (USD)"] / NIO_PER_USD)

    # Inventario: antigüedad nula imputada con el promedio del modelo-mes (celda 15)
    inventory = sheets["Inventario"].copy()
    inventory["month"] = inventory["Mes (cierre)"].dt.to_period("M")
    age_col = "Antigüedad promedio (días)"
    inventory["age_days"] = inventory[age_col].fillna(
        inventory.groupby(["month", "Modelo"])[age_col].transform("mean")
    )  # S1.5

    # Leads: IDs repetidos, flotas y motivo "sin disponibilidad" agrupado (celda 17)
    raw_l = sheets["Leads"]
    duplicated_leads = int(raw_l["ID Oportunidad"].duplicated().sum())
    leads = raw_l.drop_duplicates(subset="ID Oportunidad").copy()  # S1.11
    leads["special_fleet"] = leads["Unidades"] >= FLEET_THRESHOLD  # S1.3
    leads["no_availability"] = (
        leads["Motivo de pérdida"]
        .astype("str")
        .where(leads["Motivo de pérdida"].notna())
        .str.contains(NO_AVAILABILITY_PATTERN, na=False)
    )  # S1.6
    leads["loss_reason_group"] = np.where(
        leads["no_availability"], "Sin disponibilidad (agrupado)", leads["Motivo de pérdida"]
    )
    leads["month"] = leads["Fecha cierre"].dt.to_period("M")

    # Pedidos y reglas de fábrica (celda 19)
    orders = sheets["Pedidos"].copy()
    orders["order_month"] = orders["Fecha pedido"].dt.to_period("M")
    orders["order_quarter"] = orders["Fecha pedido"].dt.to_period("Q")
    orders["in_order_window"] = orders["Fecha pedido"].dt.month.isin(ORDER_WINDOW_MONTHS)
    unknown_status = set(orders["Estado"].dropna()) - {"Recibido", "En tránsito"}
    if unknown_status:
        raise DataError(
            f"Estados de pedido no reconocidos en «Pedidos»: {', '.join(sorted(unknown_status))} "
            "(se esperan «Recibido» o «En tránsito»)."
        )
    communications = sheets["Comunicados"].copy()
    rules = parse_order_rules(communications)
    if rules.empty:
        warnings.append(
            "No se encontró el comunicado de pedido mínimo y múltiplo: se usa mínimo 1 y múltiplo 1. "
            "Se pueden fijar por modelo en la app."
        )
    else:
        rules.index = rules.index.map(normalize_model)
        missing_rules = [m for m in models if m not in rules.index]
        if missing_rules:
            warnings.append(
                f"El comunicado de mínimos no incluye {', '.join(missing_rules)}: se usa mínimo 1 y múltiplo 1."
            )
        rules = rules[rules.index.isin(models)]

    # Conciliación: inventario = anterior + recepciones − facturas (celda 21)
    sales["month"] = sales["Fecha"].dt.to_period("M")
    sales["fiscal_year"] = np.where(
        sales["Fecha"].dt.month >= 10, sales["Fecha"].dt.year + 1, sales["Fecha"].dt.year
    )
    stock = monthly_table(inventory, "Modelo", "Unidades", models)
    received = orders[orders["Estado"] == "Recibido"].assign(
        month=lambda x: x["Fecha de recepción"].dt.to_period("M")
    )
    received_m = monthly_table(received, "Modelo", "Unidades", models, stock.index)
    sold = monthly_table(sales[~sales["is_credit_note"]], "Modelo", "Unidades", models, stock.index)
    diff = (stock - (stock.shift(1) + received_m - sold)).iloc[1:]
    reconciliation_differences = int((diff != 0).sum().sum())
    if reconciliation_differences:
        warnings.append(
            f"El inventario no cuadra con recepciones y facturas en {reconciliation_differences} de {diff.size} "
            "celdas modelo-mes: revisar la hoja «Inventario» antes de confiar en el pedido."
        )

    # Resumen de calidad (celda 24), con las cifras de este archivo
    changed = {(c.sheet, c.column): c.cells_changed for c in log}
    quality = [
        QualityIssue(
            "Ventas",
            "Modelo con variantes (mayúsculas, espacios, prefijo «Toyota»)",
            str(changed[("Ventas", "Modelo")]),
            "Normalizado contra catálogo",
        ),
        QualityIssue("Ventas", "Sucursal con variantes", str(changed[("Ventas", "Sucursal")]), "Normalizado"),
        QualityIssue("Ventas", "Filas duplicadas exactas", str(duplicated_sales), "Eliminadas (S1.1)"),
        QualityIssue(
            "Ventas",
            "Notas de crédito (devoluciones)",
            str(int(sales["is_credit_note"].sum())),
            "Se netean de la demanda; no vuelven a inventario (S1.2)",
        ),
        QualityIssue(
            "Ventas",
            f"Facturas de flota especial (≥ {FLEET_THRESHOLD} unidades)",
            str(int(sales["special_fleet"].sum())),
            "Excluidas de la demanda base (S1.3)",
        ),
        QualityIssue(
            "Ventas",
            "Precio capturado en córdobas",
            str(int(sales["price_in_cordobas"].sum())),
            "Excluido del análisis de precio (S1.4)",
        ),
        QualityIssue(
            "Ventas", "Color nulo", str(int(raw_v["Color"].isna().sum())), "Se mantiene como desconocido"
        ),
        QualityIssue(
            "Inventario", "Modelo con variantes", str(changed[("Inventario", "Modelo")]), "Normalizado"
        ),
        QualityIssue(
            "Inventario",
            "Antigüedad nula",
            str(int(inventory[age_col].isna().sum())),
            "Imputada con el promedio del modelo-mes (S1.5)",
        ),
        QualityIssue(
            "Leads",
            "Modelo de interés con variantes",
            str(changed[("Leads", "Modelo de interés")]),
            "Normalizado",
        ),
        QualityIssue("Leads", "ID de oportunidad duplicado", str(duplicated_leads), "Eliminados (S1.11)"),
        QualityIssue(
            "Leads",
            "Motivo «sin disponibilidad» en varias redacciones",
            str(int(leads["no_availability"].sum())),
            "Agrupado en un motivo (S1.6)",
        ),
        QualityIssue(
            "Leads",
            f"Oportunidades de flota especial (≥ {FLEET_THRESHOLD} unidades)",
            str(int(leads["special_fleet"].sum())),
            "Marcadas como en Ventas (S1.3)",
        ),
        QualityIssue("Pedidos", "Modelo con variantes", str(changed[("Pedidos", "Modelo")]), "Normalizado"),
        QualityIssue(
            "Todas",
            "Inventario frente a facturas y recepciones (sin NC)",
            f"{reconciliation_differences} dif.",
            "Cuadra exacto" if reconciliation_differences == 0 else "Revisar antes de usar",
        ),
    ]

    data_cutoff = inventory["Mes (cierre)"].max()
    dictionary_cutoff = _dictionary_cutoff(raw)
    if dictionary_cutoff is not None and dictionary_cutoff.normalize() != data_cutoff.normalize():
        warnings.append(
            f"El Diccionario indica corte {dictionary_cutoff:%d/%m/%Y}, pero la última foto de inventario es del "
            f"{data_cutoff:%d/%m/%Y}; se usa la foto de inventario."
        )

    base = CleanBase(
        models=models,
        sales=sales,
        base_sales=sales[~sales["special_fleet"]],  # demanda base: venta neta sin flotas especiales (S1.3)
        inventory=inventory,
        leads=leads,
        orders=orders,
        economics=economics.set_index("Modelo"),
        communications=communications,
        rules=rules,
        data_cutoff=data_cutoff,
    )
    summary = CleaningSummary(
        sheets={name: len(df) for name, df in raw.items()},
        period_start=sales["Fecha"].min(),
        period_end=sales["Fecha"].max(),
        suggested_cutoff=data_cutoff,
        changes=[c for c in log if c.cells_changed > 0],
        quality=quality,
        reconciliation_differences=reconciliation_differences,
        reconciliation_cells=int(diff.size),
        warnings=warnings,
    )
    return base, summary


def load(source: bytes | Path) -> tuple[CleanBase, CleaningSummary]:
    return clean(read_excel(source))


MONTHS_BY_NAME = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def mentioned_models(text: str, models: list[str]) -> list[str]:
    """Modelos del catálogo citados en un texto, del nombre más largo al más corto («Corolla Cross» ≠ «Corolla»)."""
    found = []
    remaining = text
    for model in sorted(models, key=len, reverse=True):
        pattern = re.compile(rf"(?<![\w-]){re.escape(model)}(?![\w-])", re.IGNORECASE)
        if pattern.search(remaining):
            found.append(model)
            remaining = pattern.sub(" ", remaining)
    return [m for m in models if m in found]


def detect_end_of_life(
    communications: pd.DataFrame, models: list[str], window_close: pd.Timestamp
) -> list[str]:
    """Modelos cuya generación actual se pide por última vez en esta ventana (comunicado del 2026-09-15).

    Busca comunicados que digan que una ventana «es la última»; si nombran la ventana, solo aplica a esa.
    """
    result: list[str] = []
    for _, row in communications.iterrows():
        text = f"{row.get('Asunto', '')}. {row.get('Texto', '')}"
        if not re.search(r"es la última|última ventana", text, re.IGNORECASE):
            continue
        window = re.search(r"ventana de (\w+) (?:de )?(\d{4}) es la última", text, re.IGNORECASE)
        if window:
            month = MONTHS_BY_NAME.get(window.group(1).lower())
            if month and (month, int(window.group(2))) != (window_close.month, window_close.year):
                continue
        result += [m for m in mentioned_models(text, models) if m not in result]
    return result


def communicated_lead_time_months(communications: pd.DataFrame) -> float | None:
    """Tiempo estándar pedido → patio del comunicado de calendario («es de 4 meses»)."""
    for text in communications.sort_values("Fecha", ascending=False)["Texto"].dropna():
        m = re.search(r"es de (\d+(?:[.,]\d+)?) meses", str(text))
        if m:
            return float(m.group(1).replace(",", "."))
    return None
