import type { CaseId } from '@/hooks/useHashRoute'

// Textos del asistente por prototipo: preguntas de ejemplo, subtítulo del panel e introducción del chat
export interface AgentCopy {
  subtitle: string
  title: string
  intro: string
  panelIntro: string
  footer: string
  suggestions: { title: string; hint: string }[]
}

export const AGENT_COPY: Record<CaseId, AgentCopy> = {
  caso1: {
    subtitle: 'Agente sobre el planificador',
    title: '¿En qué te ayudo con el pedido?',
    intro:
      'Usa las mismas herramientas que la pantalla: no calcula por su cuenta, consulta el motor del planificador y te lo explica. Puede cambiar los supuestos en pantalla, abrir secciones, dibujar gráficos, exportar los CSV y guardar el plan con tu aprobación.',
    panelIntro:
      'Pregunta por el pedido, los supuestos, las ventas o el seguimiento. El asistente usa las mismas herramientas que la pantalla: no calcula por su cuenta, consulta el motor y te lo explica. Puede cambiar los supuestos que ves, abrir secciones y guardar el plan con tu aprobación.',
    footer: 'Las cifras salen del motor del planificador; la decisión es tuya. La conversación no se guarda al salir.',
    suggestions: [
      {
        title: 'Con base en los datos, ¿cuál debería ser el pedido a fábrica de cada modelo para el próximo ciclo?',
        hint: 'La pregunta del caso: el pedido recomendado, modelo por modelo',
      },
      { title: '¿Por qué Yaris queda en cero?', hint: 'Cómo se llega a la cifra de un modelo' },
      { title: 'Sube la demanda 20 % y compárame el pedido', hint: 'Cambia los supuestos en pantalla' },
      { title: 'Grafica las ventas de Corolla Cross por mes', hint: 'Un gráfico con datos del tablero' },
      { title: '¿Qué tan bien acertó la herramienta en ciclos pasados?', hint: 'Seguimiento y corrección aprendida' },
      { title: '¿Qué pasa si fábrica adelanta Corolla Cross?', hint: 'Escenario sin tocar la pantalla' },
    ],
  },
  caso2: {
    subtitle: 'Agente sobre la cola de renovaciones',
    title: '¿En qué te ayudo con las renovaciones?',
    intro:
      'Usa las mismas herramientas que la pantalla: no calcula por su cuenta, consulta la cola, la simulación y la bitácora y te lo explica. Puede cambiar los supuestos, explicar por qué una póliza va primero, redactar el mensaje del canal automático, resumir las llamadas previas y registrar un resultado con tu aprobación.',
    panelIntro:
      'Pregunta a quién llamar primero, por qué una póliza va donde va o qué pasa con otra capacidad. El asistente no inventa cifras: consulta la cola y la simulación. Puede cambiar los supuestos, abrir secciones, redactar mensajes y registrar resultados con tu aprobación.',
    footer: 'Las cifras salen del motor de la cola; la decisión es tuya. La conversación no se guarda al salir.',
    suggestions: [
      {
        title: 'Con 5 gestores y el primer contacto a 3 días del vencimiento en la mitad de los casos, ¿cómo optimizarías el proceso de renovaciones?',
        hint: 'La pregunta del caso: diagnóstico, propuesta, impacto y puesta en marcha',
      },
      { title: '¿A quién llamo primero hoy y por qué?', hint: 'La cola del día, ordenada por fecha límite y score' },
      { title: 'Explícame la póliza CAP-DH-111156', hint: 'Cómo se llega a su prioridad' },
      { title: '¿Qué pasa con 200 llamadas al día?', hint: 'Escenario sin tocar la pantalla' },
      { title: 'Abre a 12 días en vez de 14 y compárame el impacto', hint: 'Cambia los supuestos en pantalla' },
      { title: 'Resume las llamadas a CAP-AU-106065 antes de volver a llamar', hint: 'La bitácora de una póliza' },
      { title: 'Grafica los primeros contactos por tramo, real frente a simulado', hint: 'Un gráfico con datos de la simulación' },
    ],
  },
}
