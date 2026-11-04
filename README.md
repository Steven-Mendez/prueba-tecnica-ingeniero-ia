# Prueba Técnica Ingeniero IA

Dos pipelines de análisis en notebooks, reproducibles de punta a punta desde los Excel originales.
Todos los datos son ficticios.

| Caso | Pregunta | Notebooks | Salida |
|---|---|---|---|
| 1 · Pedido a fábrica | ¿Cuántas unidades de cada modelo pedir en la ventana que cierra el 30-oct-2026? | `notebooks/caso1/` | `outputs/pedido_2026-10_por_modelo.csv`, `outputs/pedido_2026-10_por_version.csv` |
| 2 · Renovaciones | ¿Cómo optimizar el proceso de renovaciones con 5 gestores? | `notebooks/caso2/` | `outputs/cola_renovaciones_2026-09-15.csv` |

Los supuestos (`S1.x`, `S2.x`) se explican en la celda del notebook donde se aplican.

El Caso 1 tiene además un **planificador de pedidos** (ver «App web»): reproduce el notebook exactamente y deja
mover cada supuesto, ajustar el pedido por modelo, ver las ventas y cada hoja de datos por separado, medir la
precisión en ventanas pasadas y seguir los planes guardados. Es un prototipo: su fuente es el Excel del caso; en
producción la alimentarían procesos de ETL.

## Estructura

```
data/raw/            caso1_vehiculos_nuevos.xlsx, caso2_renovaciones.xlsx  (Excel originales)
data/processed/      caso{1,2}_limpio.pkl, escritos por 00_limpieza (no se versionan: se regeneran al correrlo)
notebooks/caso1/     00_limpieza → 01_eda → 02_pedido_fabrica
notebooks/caso2/     00_limpieza → 01_eda_diagnostico → 02_prototipo_priorizacion
outputs/             CSV y figuras (outputs/figuras/) que producen los notebooks 02
app/                 API FastAPI y motor del Caso 1 en app/services/factory_order/ (ver «App web»)
frontend/            React + Vite + TypeScript + shadcn/ui + Recharts; su build (frontend/dist/) lo sirve la API
tests/               pytest: el motor de la app reproduce los CSV del notebook y la API responde lo esperado
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
| 6. Agregación y representación | `00_limpieza` §5 (base limpia), `02` §3 (tablas mes × modelo) y §8 (por versión) | `00_limpieza` §5: una fila por póliza con periodo, comisión y tramo de anticipación |
| 7. Análisis | `01_eda` (demanda, inventario, lead time, economía) y `02` §2–§9 (cálculo del pedido y sensibilidad) | `01_eda_diagnostico` (causas y costo) y `02` §2–§5 (enrutamiento, prioridad, simulación, impacto) |
| 8. Visualización | Gráficas de `01_eda` y resumen para la gerencia en `02` §10 | Gráficas de `01_eda_diagnostico` y resumen para el Comité en `02` §6 |
| 9. Uso de los resultados | `02` §11–§13: pedido exportado, sistema para cada ciclo y respuesta a la gerencia | `02` §7–§10: cola del día, piloto y medición, prototipo y respuesta al Comité |

## Cómo reproducirlo

Requisitos: Python 3.12+ y [uv](https://docs.astral.sh/uv/).

```bash
uv sync --all-groups            # instala la API y el grupo `notebooks` (pandas, matplotlib, openpyxl, jupyter)
# los dos Excel ya están en data/raw/
```

Los notebooks se ejecutan **desde su carpeta** (resuelven la raíz del repo con `Path.cwd().parents[1]`)
y en orden, porque `00_limpieza` escribe la base limpia que leen los otros dos:

```bash
cd notebooks/caso1
uv run --group notebooks jupyter nbconvert --to notebook --execute --inplace 00_limpieza.ipynb 01_eda.ipynb 02_pedido_fabrica.ipynb

cd ../caso2
uv run --group notebooks jupyter nbconvert --to notebook --execute --inplace 00_limpieza.ipynb 01_eda_diagnostico.ipynb 02_prototipo_priorizacion.ipynb
```

También se pueden abrir y correr en JupyterLab (`uv run --group notebooks jupyter lab`). Los notebooks guardan sus salidas,
así que se pueden leer sin ejecutarlos.

## Cómo se usa en cada ciclo

### Caso 1 · sistema de pedidos

1. Reemplazar el Excel en `data/raw/` y fijar `cutoff_date` y `order_window_close` en `PARAMS` de
   `00_limpieza.ipynb`.
2. `00_limpieza` valida y concilia (inventario = anterior + recepciones − facturas, modelos y sucursales
   dentro de catálogo) y **se detiene** con un `assert` si aparece algo nuevo: una grafía desconocida, un
   modelo fuera de catálogo, una regla de fábrica que no se pudo leer del comunicado.
3. `02_pedido_fabrica` recalcula el lead time y la fracción de llegadas tardías desde la hoja *Pedidos*,
   usa los mínimos y múltiplos que `00_limpieza` leyó de *Comunicados*, calcula el pedido y exporta las tablas por modelo y por versión
   a `outputs/` junto con la figura para la gerencia.
4. El planificador revisa la tabla «cómo se llega» y la sensibilidad, ajusta lo que los datos no saben
   (flotas comprometidas, lanzamientos, promociones) y envía el pedido.

Con la app web el ciclo no necesita tocar los notebooks: con la fuente al día (en producción, vía ETL), la app la
limpia y concilia con las mismas reglas, deriva el corte, el cierre de ventana, el lead time, los mínimos y el fin de
generación de sus propias hojas, y el planificador hace los pasos 3 y 4 en pantalla, guarda el plan y descarga
los mismos CSV.

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

## App web

Un planificador de pedidos FastAPI + React, desplegable como un solo servicio en
[FastAPI Cloud](https://fastapicloud.com). La interfaz usa el layout de sidebar de shadcn/ui: navegación a la
izquierda (Planificador, Seguimiento, Ventas y Datos con cada hoja) y el contenido a la derecha.

**Fuente de datos.** Es un prototipo: la fuente es el Excel del caso (`FACTORY_ORDER_EXCEL`, por defecto el del
repo), el mismo del análisis. Esos datos no cambian, así que la app lo lee y lo valida una vez al arrancar. En
producción la alimentarían procesos de ETL (ventas, inventario, CRM, pedidos a fábrica). No hay carga manual de
archivos. Para revisar la fuente cada tanto existe `DATA_CHECK_SECONDS`, y `POST /api/data/refresh` la vuelve a
leer.

El motor (`app/services/factory_order/`) es un puerto de `00_limpieza` y `02_pedido_fabrica`: con el Excel del
repo y los valores por defecto da el mismo pedido (341 unidades, USD 10,951,670) y exporta los mismos CSV byte
a byte (lo verifican los tests). Secciones:

- **Inicio.** Bienvenida a quien revisa la prueba y arranque del recorrido guiado (driver.js), que pasa por
  Seguimiento, Ventas y Datos y termina en el Planificador con el ejercicio completo: crear y guardar el pedido
  de la ventana actual. También se abre desde el icono «?» de cualquier pantalla.

- **Planificador (crear pedido).** Cuatro pasos a la vista: ventana, supuestos, ajustes por modelo y el paquete
  a pedir, con su total y si ya se guardó. Se elige qué ventana planificar: la actual o las tres siguientes (con
  los mismos datos; los pedidos guardados de las ventanas intermedias cuentan como tránsito, y si falta alguno la
  app lo avisa). Seguimiento compara, ventana por ventana, lo que proyectó la herramienta con lo que pasó.
  Cada métrica lleva un tooltip que la explica en lenguaje llano
  (`frontend/src/lib/glossary.ts`). Los supuestos van en una columna
  junto al resultado en pantallas anchas (en el móvil, un panel desde la derecha): lead time y llegadas tardías,
  ajuste de demanda, demanda en meses sin stock, corrección aprendida, sustitución, fin de generación y stock de
  seguridad, cada uno con una ayuda que explica qué mueve; el pedido se recalcula en ~0.1 s con un resumen del
  impacto de cada cambio. Cada modelo se puede
  ajustar con lo que los datos no saben (unidades extra, pedido fijado a mano, otra regla de fábrica) y explica
  cómo se llega a su cifra con una cascada. Pestañas *Pedido*, *Demanda*, *Sensibilidad*, *Versiones* y *Ciclo*.
  Con una fecha de corte anterior la app usa solo lo que se sabía entonces (validación histórica). «Guardar plan»
  registra el pedido decidido; también se exportan los CSV.
- **Seguimiento.** Para cada ventana pasada cuyo horizonte ya está en los datos, compara la demanda que habría
  proyectado la herramienta con la real (demanda ajustada) y su pedido con el que de verdad se hizo; resume el
  error y el sesgo por modelo. Ese sesgo es la **corrección aprendida** que se puede aplicar en el planificador
  (acotada a ±25 % y solo con ciclos cerrados antes del corte, sin mirar el futuro). Con cada mes que agrega el
  mes nuevo en los datos se cierra un ciclo más y la corrección se recalibra. Los planes guardados muestran su avance frente a la
  demanda real a medida que llegan los meses del horizonte.
- **Ventas.** Venta neta y venta perdida por disponibilidad por mes, modelo, sucursal y tipo de cliente, con
  comparación contra el año anterior, versiones y vendedores principales; filtros de periodo, modelo, sucursal,
  tipo de cliente y flotas especiales.
- **Datos.** Cada hoja de datos del Excel por separado y ya limpia (el Diccionario es documentación y no se
  muestra), con búsqueda, filtros, orden y paginación.

| Ruta | Qué hace |
|---|---|
| `GET /api/health` | Estado de la app |
| `GET /api/data/status` | Versión de la fuente en uso, cuándo se leyó, último error y validación de la limpieza |
| `POST /api/data/refresh` | Vuelve a leer la fuente (en producción lo llamaría el ETL al terminar una entrega) |
| `GET /api/data/sheets/{sales,inventory,leads,orders,economics,communications}` | Una hoja limpia y paginada (`q`, `model`, `date_from`, `date_to`, `flag`, `sort`, `desc`) |
| `GET /api/sales/overview` | Tablero de ventas con filtros (`date_from`, `date_to`, `models`, `branches`, `customer_types`, `include_fleet`) |
| `GET /api/factory-order/parameters` | Parámetros por defecto, valores derivados de los datos, catálogo y ventanas que se pueden planificar (actual, siguientes y pasadas) |
| `POST /api/factory-order/calculate` | Calcula el pedido con los parámetros del cuerpo (`{}` = los del notebook); en ventanas futuras los planes guardados intermedios cuentan como tránsito |
| `POST /api/factory-order/export/{model,version}` | Los CSV del notebook, calculados con esos parámetros |
| `GET /api/factory-order/accuracy` | Precisión del pronóstico en los ciclos cerrados y corrección aprendida |
| `GET`, `POST /api/factory-order/plans` · `GET`, `PATCH`, `DELETE /api/factory-order/plans/{id}` | Planes guardados con su seguimiento |
| `GET /api/factory-order/notebook-order` | El pedido tal como lo exportó el notebook (referencia) |
| `/api/docs` | Documentación interactiva (OpenAPI) |
| `/` | Frontend compilado (`frontend/dist/`) |

```
app/main.py                          crea la app, monta los routers bajo /api y sirve frontend/dist
app/config.py                        Settings (pydantic-settings, lee .env) y rutas relativas a la raíz del repo
app/routers/                         data.py (fuente y hojas), sales.py, factory_order.py (planificador)
app/schemas/                         modelos Pydantic (frontend/src/features/*/types.ts los replican)
app/services/factory_order/
  source.py                          fuente de datos: lee el Excel (y en producción recargaría lo que deje el ETL)
  cleaning.py                        lectura y limpieza del Excel (00_limpieza) y lectura de los comunicados
  model.py                           modelo de pedido (02_pedido_fabrica §2–§9), mismas funciones que el notebook
  explanation.py                     «cómo se llega» a cada pedido, con las cifras del cálculo
  calculation.py                     resuelve parámetros, corre el modelo y los escenarios, arma la respuesta
  tracking.py                        ciclos pasados: precisión del pronóstico y corrección aprendida
  plans.py                           planes guardados (un JSON por plan en PLANS_DIR) y su seguimiento
  explorer.py, sales.py              hojas por separado y tablero de ventas
frontend/src/features/               app (sidebar), factory-order (planificador), tracking, sales, data
```

El código está en inglés; comentarios, documentación e interfaz en español. Para agregar un endpoint: el modelo
en `app/schemas/`, la lógica en `app/services/`, la ruta en un router de `app/routers/` y
`api.include_router(...)` en `app/main.py`. Si lee un archivo nuevo de `outputs/` o `data/`, hay que
reincluirlo en `.fastapicloudignore` para que llegue al deploy.

Las dependencias de la API van en `[project.dependencies]`; lo que solo usan los notebooks va en el grupo
`notebooks`, que no es un grupo por defecto, así que un `uv sync` sin flags (como el del deploy) no lo instala.

Limitación del prototipo: los planes guardados son archivos JSON en `PLANS_DIR`. En FastAPI Cloud el disco no
es persistente, así que un redespliegue los borra; en producción irían a una base de datos, y la fuente apuntaría
al archivo o al almacenamiento donde escribe el ETL.

### Correr en local

Requisitos adicionales: Node.js 20.19+ (o 22.12+).

```bash
uv sync                          # dependencias de la API
cd frontend && npm install && cd ..
cp .env.example .env             # opcional: todos los valores tienen default

# terminal 1: API con recarga en http://localhost:8000 (el entrypoint está en [tool.fastapi] de pyproject.toml)
uv run fastapi dev

# terminal 2: frontend con recarga en http://localhost:5173; Vite reenvía /api a localhost:8000
cd frontend && npm run dev
```

Si no existe `frontend/dist/`, `fastapi dev` solo muestra un aviso y la API funciona igual.

### Build y deploy

FastAPI Cloud instala las dependencias de Python pero **no compila el frontend**, así que el build se hace en
local antes de cada deploy:

```bash
cd frontend && npm run build && cd ..   # genera frontend/dist/
uv run fastapi run                      # opcional: probar el resultado de producción en http://localhost:8000
uv run fastapi deploy                   # la primera vez abre el navegador para iniciar sesión
```

Qué se sube: `fastapi deploy` respeta `.gitignore` y `.fastapicloudignore` (este último manda) y nunca sube
`.env`. `frontend/dist/` está en `.gitignore` (no se versiona) y `.fastapicloudignore` lo reincluye con
`!frontend/dist/`; también excluye `notebooks/`, `tests/`, el resto de `frontend/`, todo `data/` salvo el Excel
del Caso 1 y todo `outputs/` salvo el CSV con el que se compara. El deploy queda en `app/`, `pyproject.toml`,
`uv.lock`, `.python-version`, `README.md`, `frontend/dist/`, `data/raw/caso1_vehiculos_nuevos.xlsx` y
`outputs/pedido_2026-10_por_modelo.csv`.

En producción la app no arranca si falta `frontend/dist/`, así que un deploy sin build falla en vez de
publicar una página vacía. Las variables de `.env.example` se configuran en el panel de FastAPI Cloud
(*Environment Variables*).

## Calidad

```bash
uv run pytest                    # el motor reproduce los CSV del notebook; API, subida y validaciones
uv run ruff check notebooks app tests && uv run ruff format --check notebooks app tests
cd frontend && npm run lint && npm run build
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
`S1.x` y `S2.x` en la celda donde se aplican. La app web del Caso 1 (motor, API y pantalla) también se
escribió con Claude Code a partir de los notebooks; su validación es el último punto de la lista.

Nada de lo que devolvió la IA se aceptó sin comprobarlo:

- **Conciliación con los datos.** Los notebooks `00_limpieza` detienen la ejecución con `assert` si un modelo,
  sucursal o valor queda fuera de catálogo o si una regla de fábrica no se pudo leer; el inventario se cuadra
  mes a mes contra facturas y recepciones (0 diferencias en 385 modelo-mes) y la bitácora de llamadas contra la
  hoja de renovaciones (0 diferencias en intentos y fecha de primer contacto).
- **Verificación cruzada de cada resultado.** Cada cifra del texto se contrasta con la tabla que la genera, y las
  tablas de tasas del Caso 2 se validan fuera de muestra (la tabla ajustada con 7 gestores reproduce la comisión
  cobrada con 5 con un error de 0.4 %, aunque por tramos los errores se compensan).
- **Sensibilidad.** El pedido del Caso 1 se recalcula con demanda ±20 %, otro lead time, sin sustitución y con dos
  variantes del stock de seguridad; el impacto del Caso 2 se reporta como rango (piso observado, meta del piloto y
  techo de la simulación, que a su vez varía según cómo se valore el tramo de anticipación) en vez de una sola cifra.
- **Reproducibilidad.** Todo se vuelve a ejecutar desde los Excel originales con los comandos de arriba.
- **La app contra el notebook.** Los tests (`tests/`) comprueban que el motor de la app, a partir del Excel
  original, produce la misma base limpia que `00_limpieza`, los mismos CSV por modelo y por versión que
  `02_pedido_fabrica` (texto idéntico) y los mismos totales en los nueve escenarios de sensibilidad, y que cada
  control del panel reproduce el escenario del notebook que le corresponde.
