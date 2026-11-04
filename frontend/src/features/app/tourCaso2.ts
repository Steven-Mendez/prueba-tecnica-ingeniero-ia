// Recorrido guiado del Caso 2 en tres partes: Panel del jefe → Supuestos y simulación → Cola del día. Termina con
// el ejercicio de registrar el resultado de la primera llamada de la cola.
import { tourActions, type TourChapter, type TourDef } from './tour'

const chapters: Record<string, TourChapter> = {
  panel: {
    title: 'Panel del jefe',
    route: 'panel',
    steps: [
      {
        popover: {
          title: 'Parte 1 · El problema, visto por el jefe de renovaciones',
          description:
            'Desde diciembre de 2025 el primer contacto ocurre a 3 días del vencimiento en lugar de 16 y la renovación cayó de 62 % a 51 %. Este panel muestra cómo queda el día con las tres reglas del prototipo: enrutar por canal, abrir a 14 días y ordenar por fecha límite y valor.',
        },
      },
      {
        element: '[data-tour="panel-kpis"]',
        popover: {
          title: 'Las cuatro cifras del día',
          description:
            'Pólizas pendientes de primer contacto, carga del día frente a la capacidad del equipo (5 × 50 llamadas), uso medio de la capacidad en la simulación y qué parte de lo registrado hoy cayó en la ventana 8–14 días.',
        },
      },
      {
        element: '[data-tour="panel-routing"]',
        popover: {
          title: 'Qué entra hoy, por canal',
          description:
            'Antes de gastar una llamada cada póliza se enruta: domiciliadas, financiadas y flotas al canal automático (renuevan igual sin llamada), teléfonos inválidos a corrección de datos y el resto a la cola telefónica. Eso libera ~1,100 llamadas al mes.',
        },
      },
      {
        element: '[data-tour="panel-agents"]',
        popover: {
          title: 'Por gestor',
          description:
            'Pendientes y registros del día de cada gestor, y su tasa histórica en la cola telefónica. G03 renueva muy por encima del resto porque llama antes: es la prueba de que con 5 gestores se puede.',
        },
      },
      {
        element: '[data-tour="panel-buckets"]',
        popover: {
          title: 'Cuándo ocurre el primer contacto',
          description:
            'Hoy (rojo) más de la mitad de los primeros contactos caen a 3 días o menos. Con las reglas (naranja) todos caen en la ventana 8–14, que es donde más se renueva (75 % frente a 42 %).',
        },
      },
      {
        element: '[data-tour="panel-metrics"]',
        popover: {
          title: 'Cómo se mide el piloto',
          description:
            'Los indicadores del piloto A/B con su línea base y su meta. Los resultados que se registran en la cola alimentan estas columnas a medida que se usa la app.',
        },
      },
    ],
  },
  supuestos: {
    title: 'Supuestos y simulación',
    route: 'supuestos',
    steps: [
      {
        popover: {
          title: 'Parte 2 · Las reglas y lo que valen',
          description:
            'La simulación recorre los 10 meses con 5 gestores día hábil por día hábil, con los mismos seguimientos que cada póliza consumió en la realidad, y calcula cuánta comisión adicional dejarían las reglas.',
        },
      },
      {
        element: '[data-tour="assumptions-impact"]',
        popover: {
          title: 'El impacto, como rango',
          description:
            'Piso: volver a la tasa que tuvo la cola con 7 gestores. Meta del piloto: 70 % de primeros contactos en ventana. Techo: la simulación completa, valorada de dos formas. La referencia es lo que hoy se pierde por contacto tardío.',
        },
      },
      {
        element: '[data-tour="assumptions-comparison"]',
        popover: {
          title: 'Anticipación real frente a simulada',
          description:
            'La mediana pasa de 3 a 14 días, el 57 % a 3 días o menos desaparece y ninguna póliza se contacta después del vencimiento, usando el 83 % de la capacidad.',
        },
      },
      {
        element: '[data-tour="assumptions-sensitivity"]',
        popover: {
          title: 'Depende de la capacidad',
          description:
            'Con 200 llamadas al día en vez de 250 el resultado cae al 57 % en ventana y 151 pólizas se quedan sin cupo. El resultado lo producen la apertura a 14 días y el margen que deja el enrutamiento, no el orden de la cola.',
        },
      },
      {
        element: '[data-tour="assumptions-rates"]',
        popover: {
          title: 'La mejora esperada por segmento',
          description:
            'Tasa de renovación por segmento y tramo de anticipación. La prioridad de cada póliza es comisión potencial × (tasa en 8–14 menos tasa a 0–3): ordenar solo por comisión mandaría llamadas a pólizas que renuevan igual.',
        },
      },
      {
        element: '[data-tour="assumptions-panel"]',
        panelStep: 'aside',
        before: () => tourActions.openPanel?.(),
        popover: {
          title: 'Mueve los supuestos',
          description:
            'Apertura, fecha límite, capacidad, gestores y meta del piloto. Cambia uno y la simulación se recalcula con el cambio frente a los valores por defecto; «Restablecer» vuelve al notebook. Prueba abrir a 12 días, que es lo que el piloto debería comparar.',
        },
      },
      {
        element: '[data-tour="assumptions-button"]',
        panelStep: 'button',
        popover: {
          title: 'Mueve los supuestos',
          description:
            'Este botón abre los supuestos (apertura, fecha límite, capacidad, meta del piloto). Cambia uno y la simulación se recalcula; «Restablecer» vuelve al notebook.',
        },
      },
    ],
  },
  cola: {
    title: 'Cola del día',
    route: 'cola',
    steps: [
      {
        popover: {
          title: 'Parte 3 · El ejercicio: la cola de un gestor',
          description:
            'Esto es lo que vería cada gestor por la mañana. Vamos a recorrerla y a registrar el resultado de la primera llamada.',
        },
      },
      {
        element: '[data-tour="queue-day"]',
        popover: {
          title: 'El día y el gestor',
          description:
            'Cualquier día hábil del periodo de 5 gestores; el del notebook es el 15 de septiembre de 2026. Con «Todos los gestores» se ve la cola completa; cada gestor vería solo la suya.',
        },
      },
      {
        element: '[data-tour="queue-kpis"]',
        popover: {
          title: 'Cómo va el día',
          description:
            'Pendientes de primer contacto, resultados registrados hoy, qué parte de ellos cayó en la ventana 8–14 y la carga frente a la capacidad del equipo.',
        },
      },
      {
        element: '[data-tour="queue-table"]',
        popover: {
          title: 'El orden de la cola',
          description:
            'Primero las pólizas que están por salir de la ventana (menos días para la fecha límite); a igual fecha, las de mayor score. Cada fila trae lo que el gestor necesita para llamar y argumentar: teléfono, vencimiento, prima anterior y nueva, cambio de prima y comisión.',
        },
      },
      {
        element: '[data-tour="queue-result"]',
        popover: {
          title: 'Registrar el resultado',
          description:
            'Último paso. Al pulsar «Registrar» se abre el formulario: elige el resultado de la llamada (por ejemplo «Cotización enviada»), una nota si quieres, y guarda. La póliza sale de las pendientes y el recorrido termina.',
        },
      },
    ],
  },
}

export const caso2Tour: TourDef = {
  order: ['panel', 'supuestos', 'cola'],
  chapters,
  finish: { label: 'Registrar resultado', selector: '[data-tour="queue-result"]' },
}
