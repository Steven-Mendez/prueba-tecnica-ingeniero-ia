# Prueba Técnica Ingeniero IA

Dos pipelines de análisis en notebooks, reproducibles de punta a punta desde los Excel originales.
Todos los datos son ficticios.

| Caso | Pregunta | Notebooks | Salida |
|---|---|---|---|
| 1 · Pedido a fábrica | ¿Cuántas unidades de cada modelo pedir en la ventana que cierra el 30-oct-2026? | `notebooks/caso1/` | `outputs/pedido_2026-10_por_modelo.csv`, `outputs/pedido_2026-10_por_version.csv` |
| 2 · Renovaciones | ¿Cómo optimizar el proceso de renovaciones con 5 gestores? | `notebooks/caso2/` | `outputs/cola_renovaciones_2026-09-15.csv` |

Los supuestos (`S1.x`, `S2.x`) se explican en la celda del notebook donde se aplican.

## Estructura

```
data/raw/            caso1_vehiculos_nuevos.xlsx, caso2_renovaciones.xlsx  (Excel originales)
data/processed/      caso{1,2}_limpio.pkl, escritos por 00_limpieza (no se versionan: se regeneran al correrlo)
notebooks/caso1/     00_limpieza → 01_eda → 02_pedido_fabrica
notebooks/caso2/     00_limpieza → 01_eda_diagnostico → 02_prototipo_priorizacion
outputs/             CSV y figuras (outputs/figuras/) que producen los notebooks 02
```

## Qué hace cada notebook

| Notebook | Caso 1 | Caso 2 |
|---|---|---|
| `00_limpieza` | Limpieza, conciliación entre hojas y lectura de las reglas de fábrica; escribe la base limpia | Limpieza y cruce con la bitácora; escribe la base limpia |
| `01_eda` / `01_eda_diagnostico` | Demanda, inventario, pérdidas por disponibilidad, lead time y economía | Anticipación del contacto, capacidad, contactabilidad y costo del problema |
| `02_pedido_fabrica` / `02_prototipo_priorizacion` | Sistema de pedidos, gráficas para la gerencia y uso en cada ciclo | Prototipo de priorización, simulación, gráficas para el Comité y diseño del piloto |

## Método

Los pasos del análisis se basan en el **Ciclo de vida del análisis de Big Data** (nueve etapas, de la evaluación
del caso empresarial al uso de los resultados). No se siguió al pie de la letra: las etapas de adquisición,
filtrado y extracción se resuelven en una sola pasada porque cada caso llega en un único Excel, y el análisis y
la visualización se reparten entre dos notebooks. El mapa de cada etapa a la sección donde ocurre:

| Etapa del ciclo | Caso 1 | Caso 2 |
|---|---|---|
| 1. Evaluación del caso empresarial | `00_limpieza` §1: pregunta, decisión, criterio de éxito, restricciones e hipótesis | `00_limpieza` §1 |
| 2. Identificación de datos | `00_limpieza` §2: hojas disponibles y datos que faltan y se pedirían | `00_limpieza` §2 |
| 3. Adquisición y filtrado | `00_limpieza` §4: lectura del Excel; fuera duplicados, notas de crédito y flotas especiales | `00_limpieza` §4: fuera duplicados; teléfonos inválidos marcados |
| 4. Extracción | `00_limpieza` §4.7: mínimos y múltiplos leídos del texto de los comunicados; §4.2: factura de referencia de cada nota de crédito | `00_limpieza` §4.1: las dos tablas apiladas de la hoja *Equipo*; §4.4: resumen por póliza desde la bitácora |
| 5. Validación y limpieza | `00_limpieza` §4: catálogo de modelos y sucursales, precios en córdobas, antigüedad nula, conciliación del inventario | `00_limpieza` §4: *Renovó*, bitácora contra renovaciones, primer contacto nulo |
| 6. Agregación y representación | `00_limpieza` §5 (base limpia) y `02` §3: tablas mes × modelo y por versión | `00_limpieza` §5: una fila por póliza con periodo, comisión y tramo de anticipación |
| 7. Análisis | `01_eda` (demanda, inventario, lead time, economía) y `02` §2–§9 (cálculo del pedido y sensibilidad) | `01_eda_diagnostico` (causas y costo) y `02` §2–§5 (enrutamiento, prioridad, simulación, impacto) |
| 8. Visualización | Gráficas de `01_eda` y resumen para la gerencia en `02` §10 | Gráficas de `01_eda_diagnostico` y resumen para el Comité en `02` §6 |
| 9. Uso de los resultados | `02` §11–§13: pedido exportado, sistema para cada ciclo y respuesta a la gerencia | `02` §7–§10: cola del día, piloto y medición, prototipo y respuesta al Comité |

## Cómo reproducirlo

Requisitos: Python 3.12+ y [uv](https://docs.astral.sh/uv/).

```bash
uv sync                         # instala pandas, matplotlib, openpyxl, jupyter
# los dos Excel ya están en data/raw/
```

Los notebooks se ejecutan **desde su carpeta** (resuelven la raíz del repo con `Path.cwd().parents[1]`)
y en orden, porque `00_limpieza` escribe la base limpia que leen los otros dos:

```bash
cd notebooks/caso1
uv run jupyter nbconvert --to notebook --execute --inplace 00_limpieza.ipynb 01_eda.ipynb 02_pedido_fabrica.ipynb

cd ../caso2
uv run jupyter nbconvert --to notebook --execute --inplace 00_limpieza.ipynb 01_eda_diagnostico.ipynb 02_prototipo_priorizacion.ipynb
```

También se pueden abrir y correr en JupyterLab (`uv run jupyter lab`). Los notebooks guardan sus salidas,
así que se pueden leer sin ejecutarlos.

## Cómo se usa en cada ciclo

### Caso 1 · sistema de pedidos

1. Reemplazar el Excel en `data/raw/` y fijar `cutoff_date` y `order_window_close` en `PARAMS` de
   `00_limpieza.ipynb`.
2. `00_limpieza` valida y concilia (inventario = anterior + recepciones − facturas, modelos y sucursales
   dentro de catálogo) y **se detiene** con un `assert` si aparece algo nuevo: una grafía desconocida, un
   modelo fuera de catálogo, una regla de fábrica que no se pudo leer del comunicado.
3. `02_pedido_fabrica` recalcula el lead time y la fracción de llegadas tardías desde la hoja *Pedidos*,
   lee mínimos y múltiplos de *Comunicados*, calcula el pedido y exporta las tablas por modelo y por versión
   a `outputs/` junto con la figura para la gerencia.
4. El planificador revisa la tabla «cómo se llega» y la sensibilidad, ajusta lo que los datos no saben
   (flotas comprometidas, lanzamientos, promociones) y envía el pedido.

Cálculo: calendario del ciclo con el lead time real → demanda ajustada por modelo (venta 12 meses + pérdidas
por disponibilidad y sustituciones solo en meses de quiebre) → estacionalidad → posición al llegar el pedido
(stock + tránsito − demanda del hueco − sustitución entrante, nunca negativa) → stock de seguridad por modelo
según el costo de faltar frente al de sobrar → pedido = demanda del horizonte + seguridad − posición,
redondeado a los mínimos y múltiplos de fábrica → mezcla por versión según el faltante de cada una.

### Caso 2 · cola de renovaciones

1. Reemplazar el Excel y, si cambia la dotación, revisar `staffing_change_date`, `daily_call_target` y
   `standard_lead_days` en `PARAMS` de `00_limpieza.ipynb`.
2. `00_limpieza` cruza cada póliza con la bitácora (intentos y fecha de primer contacto deben coincidir) y
   escribe la base limpia.
3. `02_prototipo_priorizacion` enruta cada póliza por canal (automático, corrección de datos, cola
   telefónica), ordena la cola por días a la fecha límite y por comisión × mejora esperada del segmento, y
   simula el periodo de 5 gestores día hábil por día hábil. `DIA_EJEMPLO` genera la cola de un día concreto
   en `outputs/`.
4. Los resultados de la bitácora realimentan la tabla de tasas por segmento y tramo de anticipación.

## Calidad

```bash
uv run ruff check notebooks && uv run ruff format --check notebooks
```

No hay credenciales ni rutas absolutas en el código.

## Uso de herramientas de IA y cómo se validó

Usé un asistente de IA (Claude Code) como apoyo en tres tareas: escribir y refactorizar código de pandas y
matplotlib a partir de la lógica que yo definía (limpieza, conciliación entre hojas, simulación de la cola,
gráficas), revisar la redacción de las celdas de texto y de las respuestas a la gerencia y al Comité, y hacer
una revisión final del repositorio contra el enunciado (re-ejecución completa, cotejo de las cifras escritas en
el texto contra las tablas calculadas, lint). El método (el ciclo de vida del análisis descrito arriba) y las
decisiones de análisis (qué supuestos tomar, cómo corregir la demanda censurada, la economía del stock de
seguridad, el enrutamiento por canal y las reglas de la cola) son míos y están documentados como supuestos
`S1.x` y `S2.x` en la celda donde se aplican.

Nada de lo que devolvió la IA se aceptó sin comprobarlo:

- **Conciliación con los datos.** Los notebooks `00_limpieza` detienen la ejecución con `assert` si un modelo,
  sucursal o valor queda fuera de catálogo o si una regla de fábrica no se pudo leer; el inventario se cuadra
  mes a mes contra facturas y recepciones (0 diferencias en 385 modelo-mes) y la bitácora de llamadas contra la
  hoja de renovaciones (0 diferencias en intentos y fecha de primer contacto).
- **Verificación cruzada de cada resultado.** Cada cifra del texto se contrasta con la tabla que la genera, y las
  tablas de tasas del Caso 2 se validan fuera de muestra (la tabla ajustada con 7 gestores reproduce la comisión
  cobrada con 5 con un error de 0.4 %).
- **Sensibilidad.** El pedido del Caso 1 se recalcula con demanda ±20 %, otro lead time y sin sustitución; el
  impacto del Caso 2 se reporta como rango (piso observado, meta del piloto, techo de la simulación) en vez de
  una sola cifra.
- **Reproducibilidad.** Todo se vuelve a ejecutar desde los Excel originales con los comandos de arriba.
