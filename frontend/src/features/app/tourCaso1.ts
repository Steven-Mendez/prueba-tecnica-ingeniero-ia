// Recorrido guiado del Caso 1 en cuatro partes: Seguimiento → Ventas → Datos → Planificador. Termina con el
// ejercicio de crear y guardar el pedido de la ventana actual.
import { tourActions, type TourChapter, type TourDef } from './tour'

const chapters: Record<string, TourChapter> = {
  seguimiento: {
    title: 'Seguimiento',
    route: 'seguimiento',
    steps: [
      {
        popover: {
          title: 'Parte 1 · ¿Qué tan bien acierta la herramienta?',
          description:
            'Antes de pedir, conviene saber cuánto se puede confiar en la propuesta. Seguimiento compara, en cada ventana pasada, lo que la herramienta proyectó con lo que de verdad pasó.',
        },
      },
      {
        element: '[data-tour="tracking-kpis"]',
        popover: {
          title: 'Las tres cifras',
          description:
            'Ciclos medidos (ventanas con horizonte ya completo), error del pronóstico (cuánto se desvía la demanda proyectada de la real) y sesgo (si tiende a proyectar de más o de menos).',
        },
      },
      {
        element: '[data-tour="tracking-charts"]',
        popover: {
          title: 'Ventana por ventana',
          description:
            'A la izquierda, demanda proyectada frente a la real de cada ciclo. A la derecha, el pedido que habría propuesto la herramienta frente al que se hizo de verdad.',
        },
      },
      {
        element: '[data-tour="tracking-models"]',
        popover: {
          title: 'Por modelo y corrección aprendida',
          description:
            'Qué modelos se proyectan de más o de menos. La corrección aprendida usa ese sesgo para ajustar la demanda de cada modelo en el planificador, si decides activarla.',
        },
      },
      {
        element: '[data-tour="tracking-plans"]',
        popover: {
          title: 'Pedidos guardados',
          description:
            'Aquí aparecerá el pedido de octubre que vas a crear al final del recorrido, y se irá comparando con la demanda real a medida que lleguen los meses.',
        },
      },
    ],
  },
  ventas: {
    title: 'Ventas',
    route: 'ventas',
    steps: [
      {
        popover: {
          title: 'Parte 2 · De dónde sale la demanda',
          description:
            'La propuesta de pedido parte de lo que se vendió y de lo que no se pudo vender por falta de stock. Esta pantalla lo muestra con filtros por periodo, modelo, sucursal y tipo de cliente.',
        },
      },
      {
        element: '[data-tour="sales-kpis"]',
        popover: {
          title: 'Venta y venta perdida',
          description:
            'Unidades netas e ingresos del periodo, y la venta perdida por disponibilidad: clientes que no compraron porque el modelo estaba agotado. Esa venta perdida se recupera en la demanda del planificador.',
        },
      },
      {
        element: '[data-tour="sales-monthly"]',
        popover: {
          title: 'Venta por mes',
          description:
            'La curva del año: diciembre pesa mucho más que enero. El planificador usa esa estacionalidad para la demanda de cada tramo del ciclo.',
        },
      },
    ],
  },
  datos: {
    title: 'Datos',
    route: 'datos/orders',
    steps: [
      {
        popover: {
          title: 'Parte 3 · Los datos de origen',
          description:
            'Todo sale de las hojas del Excel del caso, ya limpias: ventas, inventario, leads, pedidos a fábrica, economía por modelo y comunicados. En producción las alimentaría el ETL.',
        },
      },
      {
        element: '[data-tour="data-sheet"]',
        popover: {
          title: 'La hoja Pedidos',
          description:
            'De aquí salen el tránsito (lo que ya viene en camino), el lead time observado y las llegadas tardías. Cada hoja se puede buscar, filtrar y ordenar.',
        },
      },
    ],
  },
  planificador: {
    title: 'Planificador',
    route: 'planificador/pedido',
    steps: [
      {
        popover: {
          title: 'Parte 4 · El ejercicio: crear el pedido de la ventana actual',
          description:
            'Ahora sí: vamos a armar el paquete que se pedirá a fábrica. La app ya trae una propuesta; tú la revisas, ajustas lo que haga falta y la guardas.',
        },
      },
      {
        element: '[data-tour="window"]',
        before: () => tourActions.useCurrentWindow?.(),
        popover: {
          title: '1 · La ventana',
          description:
            'Déjala en la ventana actual. Las siguientes se planifican después, con lo que guardes ahora contando como tránsito.',
        },
      },
      {
        element: '[data-tour="steps"]',
        popover: {
          title: 'Los cuatro pasos',
          description:
            'Ventana, supuestos, ajustes por modelo y paquete a pedir. A la derecha ves el total propuesto y si ya se guardó un pedido para esta ventana.',
        },
      },
      {
        element: '[data-tour="kpis"]',
        popover: {
          title: 'La propuesta en cifras',
          description:
            'Unidades a pedir, capital comprometido, modelos con pedido y la venta que no se podrá atender antes de que llegue el pedido. Cada cifra tiene su ⓘ.',
        },
      },
      {
        element: '[data-tour="order-chart"]',
        popover: {
          title: 'Qué cubre el pedido',
          description:
            'Por modelo: lo que ya habrá al llegar (gris), lo que se pide (azul) y lo que hay que cubrir (punto). La raya es el pedido de la ventana anterior.',
        },
      },
      {
        element: '[data-tour="params-panel"]',
        panelStep: 'aside',
        before: () => tourActions.openPanel?.(),
        popover: {
          title: '2 · Los supuestos',
          description:
            'Lead time, llegadas tardías, demanda y seguridad vienen de los datos («auto»). Puedes mover alguno y ver el pedido recalcularse; «Restablecer» vuelve a los valores por defecto. Para el ejercicio, déjalos como están.',
        },
      },
      {
        element: '[data-tour="params-button"]',
        panelStep: 'button',
        popover: {
          title: '2 · Los supuestos',
          description:
            'Este botón abre los supuestos (lead time, demanda, seguridad). Para el ejercicio, déjalos como están.',
        },
      },
      {
        element: '[data-tour="order-table"]',
        popover: {
          title: '3 · Ajustes por modelo',
          description:
            'La app recomienda la cantidad de cada modelo, pero mandas tú: escribe otra en la columna Pedido (por ejemplo 500 Hilux) y queda fijada a mano, con la recomendación debajo para volver. La flecha abre cómo se llega a la cifra.',
        },
      },
      {
        element: '[data-tour="export"]',
        popover: {
          title: 'Exportar',
          description: 'El pedido en CSV, por modelo y por versión, para enviarlo o revisarlo en Excel.',
        },
      },
      {
        element: '[data-tour="save"]',
        popover: {
          title: '4 · Guardar el pedido',
          description:
            'Último paso. Al pulsar «Guardar pedido» se abre el formulario: ponle nombre, una nota si quieres, y guarda. Con eso queda creado el pedido de la ventana y el recorrido termina.',
        },
      },
    ],
  },
}

export const caso1Tour: TourDef = {
  order: ['seguimiento', 'ventas', 'datos', 'planificador'],
  chapters,
  finish: { label: 'Guardar pedido', selector: '[data-tour="save"]' },
}
