// Qué hizo el asistente, en palabras (los nombres de las herramientas están en app/services/agent/tools.py y
// app/services/agent/renewals_tools.py)
export const STEP_LABELS: Record<string, string> = {
  contexto: 'Leyó qué hay en pantalla',
  // Caso 1
  calcular_pedido: 'Calculó un escenario',
  aplicar_supuestos: 'Cambió los supuestos',
  restablecer_supuestos: 'Restableció los supuestos',
  explicar_modelo: 'Revisó un modelo',
  sensibilidad: 'Consultó la sensibilidad',
  precision: 'Consultó el seguimiento',
  ventas: 'Consultó las ventas',
  consultar_hoja: 'Consultó una hoja de datos',
  listar_planes: 'Consultó los planes guardados',
  guardar_plan: 'Guardó el plan',
  cambiar_estado_plan: 'Cambió el estado de un plan',
  borrar_plan: 'Borró un plan',
  exportar_csv: 'Exportó un CSV',
  mostrar: 'Abrió una sección',
  grafico: 'Dibujó un gráfico',
  // Caso 2
  cola_del_dia: 'Consultó la cola del día',
  simular: 'Simuló un escenario',
  cambiar_dia: 'Cambió el día de la cola',
  explicar_poliza: 'Revisó una póliza',
  redactar_mensaje: 'Redactó un mensaje',
  resumen_interaccion: 'Resumió las llamadas previas',
  registrar_resultado: 'Registró el resultado de una llamada',
  exportar_cola: 'Exportó la cola del día',
}

export const APPROVAL_LABELS: Record<string, string> = {
  guardar_plan: 'Guardar el plan',
  cambiar_estado_plan: 'Cambiar el estado del plan',
  borrar_plan: 'Borrar el plan',
  registrar_resultado: 'Registrar el resultado de la llamada',
}

export const argLabel = (key: string) =>
  ({ nombre: 'Nombre', nota: 'Nota', plan_id: 'Plan', estado: 'Estado', poliza: 'Póliza', resultado: 'Resultado', gestor: 'Gestor' })[key] ?? key
