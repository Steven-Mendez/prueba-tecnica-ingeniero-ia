"""Motor del Caso 1 (pedido a fábrica).

Puerto fiel de `notebooks/caso1/00_limpieza.ipynb` (limpieza) y `02_pedido_fabrica.ipynb` (modelo de pedido),
parametrizado para que la app pueda recalcular con otros supuestos y con el Excel de ciclos futuros.

- `cleaning`: lee y limpia el Excel (S1.1–S1.6, S1.11) y deriva los valores por defecto del ciclo.
- `model`: demanda ajustada, estacionalidad, posición al llegar, stock de seguridad, redondeo y mezcla por versión.
- `explanation`: textos de «cómo se llega» a cada pedido, generados a partir de las cifras.
- `calculation`: orquesta un cálculo completo a partir de `Parameters` y lo convierte al esquema de la API.
- `source`: la fuente de datos (el Excel que alimenta el ETL), recargada cuando cambia.
- `explorer`, `sales`: cada hoja por separado y el tablero de ventas.
- `tracking`, `plans`: precisión en ciclos pasados, corrección aprendida y planes guardados.
"""
