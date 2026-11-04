// Explicaciones en lenguaje llano de cada métrica y término de la app, para los tooltips (<Term help={G.x}>).
// Una sola fuente para que la misma métrica se explique igual en todas las pantallas.

export const G = {
  // Pedido
  unidades_a_pedir:
    'Total de unidades que la herramienta propone pedir a fábrica en esta ventana, ya redondeado a los mínimos y múltiplos de cada modelo. La cifra pequeña lo compara con lo que se pidió en la ventana anterior.',
  capital:
    'Lo que cuesta ese pedido a precio de costo (unidades × costo unitario de cada modelo). Es el dinero que queda comprometido con fábrica.',
  modelos_con_pedido: 'Cuántos modelos del catálogo llevan al menos una unidad en el pedido. Los que quedan en cero tienen stock o tránsito suficiente.',
  venta_no_atendible:
    'Unidades que se van a vender como perdidas antes de que llegue este pedido: la demanda del hueco supera el stock más lo que ya viene en tránsito. Ningún pedido de esta ventana las rescata; solo un pedido especial fuera de ventana.',
  demanda_mensual:
    'Unidades que se venden al mes de ese modelo, en promedio de los últimos meses, corregidas para contar también lo que no se pudo vender por falta de stock.',
  cobertura_hoy:
    'Meses que aguantan el stock actual más el tránsito al ritmo de venta actual. Si es menor que el hueco, el modelo se agota antes de que llegue el pedido (en rojo).',
  posicion:
    'Unidades que quedarán cuando llegue el pedido: stock de hoy + tránsito − lo que se venderá hasta entonces. Nunca es negativa: lo que falte se pierde, no se recupera después.',
  demanda_mas_seguridad:
    'Lo que debe cubrir el pedido: la venta esperada entre esta llegada y la siguiente (horizonte) más un colchón de seguridad por si la demanda sube o parte del pedido llega tarde.',
  bruto: 'Pedido antes de redondear: demanda del horizonte + seguridad − posición al llegar − tránsito que llega dentro del horizonte.',
  min_mult:
    'Reglas de fábrica para ese modelo: pedido mínimo y múltiplo del lote. El pedido bruto se redondea al múltiplo; si queda por debajo del mínimo, sube al mínimo o se deja en cero.',
  pedido:
    'Cantidad que irá en el pedido de ese modelo. La app la recomienda (ya redondeada a las reglas de fábrica), pero se puede escribir otra: queda fijada a mano y la recomendación se muestra debajo para volver a ella.',
  impacto: 'Diferencia frente al pedido que saldría con todos los supuestos en su valor por defecto.',
  ventana_anterior: 'Lo que se pidió de ese modelo en la ventana anterior, para comparar.',
  pedido_real: 'Lo que de verdad se pidió en esta ventana, según la hoja de pedidos. Solo aparece al validar ventanas pasadas.',
  venta_real_horizonte:
    'Lo que de verdad se vendió entre esta llegada y la siguiente. Si el modelo se agotó, la venta registrada queda por debajo de la demanda real.',
  cobertura_final: 'Meses que cubrirán, al llegar el pedido, la posición más el pedido, al ritmo de venta esperado del horizonte.',
  grafico_pedido:
    'Por modelo: en gris lo que ya habrá cuando llegue el pedido, en azul lo que se pide, el punto es la demanda del horizonte más la seguridad (lo que hay que cubrir) y la raya el pedido de la ventana anterior.',
  grafico_cobertura:
    'Meses que aguanta cada modelo hoy (stock + tránsito, gris) y tras el pedido (azul). La línea punteada es el hueco hasta la llegada: si la barra gris no llega, el modelo se agota antes.',

  // Ciclo
  hueco:
    'El «hueco»: los meses que faltan desde la fecha de los datos hasta que llegue este pedido. En ese tiempo solo se puede vender lo que hay en stock y lo que ya viene en camino; si no alcanza, esa venta se pierde.',
  horizonte:
    'El «horizonte»: los meses que van desde que llega este pedido hasta que llegue el de la ventana siguiente. Es lo que este pedido tiene que cubrir; por eso la demanda se calcula sobre esos meses.',
  lead_time: 'Días que tarda un pedido desde que cierra la ventana hasta que las unidades están en el patio.',
  llegadas_tardias: 'Porcentaje de las unidades que llegan después del lead time habitual. Se compensa con una reserva en el stock de seguridad.',
  factor_estacional:
    'Cuánto vende el periodo frente a un mes promedio: 1.05 significa un 5 % más (diciembre pesa). Se aplica a la demanda del hueco y del horizonte.',
  margen: 'Lo que se gana por unidad vendida (precio × margen bruto). Es lo que cuesta quedarse sin stock y perder la venta.',
  costo_sobrar:
    'Lo que cuesta una unidad que sobra: meses extra de plan piso más el descuento con que se termina vendiendo.',
  nivel_servicio:
    'Probabilidad de no quedarse sin stock que conviene a ese modelo. Sale de comparar lo que cuesta faltar con lo que cuesta sobrar: a margen bajo y descuento alto, nivel más bajo.',
  z: 'Cuántas desviaciones de la demanda cubre la seguridad; es la traducción estadística del nivel de servicio (0 = sin seguridad).',

  // Demanda
  venta: 'Unidades facturadas en el periodo, sin flotas especiales ni notas de crédito.',
  meses_quiebre: 'Meses en los que el modelo empezó o terminó en cero. En esos meses la venta registrada no mide la demanda real.',
  perdidas_recuperables:
    'Clientes que buscaban ese modelo y no compraron por falta de disponibilidad, en los meses de quiebre. Se suman a la demanda.',
  sustitucion_neta:
    'Ventas que ganó o perdió por sustitución: clientes de otro modelo agotado que compraron este (+) o clientes suyos que compraron otro (−).',
  demanda_ajustada: 'Venta + pérdidas recuperables + sustitución neta. Es la demanda que habría habido con stock.',
  desviacion: 'Cuánto varía la demanda ajustada de un mes a otro. A más variación, más stock de seguridad.',
  estacionalidad:
    'Peso de cada mes frente a un mes promedio (1.0). Se calcula con los años fiscales completos; los meses sombreados son el hueco y el horizonte de este ciclo.',
  sustituciones: 'Clientes que buscaban un modelo que estaba agotado y terminaron comprando otro, en los últimos meses.',

  // Sensibilidad
  escenarios:
    'Total del pedido si se cambia un solo supuesto cada vez. Un rango estrecho significa que el pedido es robusto; un modelo muy sensible conviene revisarlo con la gerencia.',
  heatmap: 'Pedido de cada modelo en cada escenario. En «Diferencia» se ve cuánto cambia frente a los parámetros actuales.',

  // Versiones
  demanda_version: 'Venta de la versión en el periodo más los leads perdidos que pedían esa versión.',
  stock_version: 'Unidades en stock de esa versión a la fecha de corte.',
  transito_version: 'Unidades de esa versión que ya vienen en camino.',
  necesidad: 'Lo que hace falta de esa versión hasta el final del horizonte, al ritmo de su demanda.',
  faltante: 'Necesidad − stock − tránsito. El pedido del modelo se reparte entre versiones en proporción al faltante.',
  pedido_version: 'Unidades de esa versión dentro del pedido del modelo.',

  // Seguimiento
  ciclos_medidos: 'Ventanas pasadas cuyo horizonte completo ya está en los datos, así se puede comparar lo proyectado con lo real.',
  error_pronostico:
    'Error medio de la demanda proyectada frente a la real, en porcentaje de la demanda real (WAPE). 0 % sería perfecto.',
  sesgo: 'Si la herramienta tiende a proyectar de más (negativo) o de menos (positivo). Es lo que corrige la «corrección aprendida».',
  proximo_ciclo: 'Fecha en que se cierra el horizonte del siguiente ciclo y se podrá medir.',
  grafico_demanda_real: 'Para cada ciclo cerrado, la demanda que proyectó la herramienta frente a la demanda real del horizonte.',
  grafico_pedido_real: 'Para cada ciclo, lo que habría pedido la herramienta frente a lo que de verdad se pidió.',
  proyectada: 'Demanda del horizonte que proyectó la herramienta en ese ciclo.',
  real: 'Demanda ajustada que hubo de verdad en el horizonte (venta más lo perdido por falta de stock).',
  correccion: 'Factor con que se multiplica la demanda de ese modelo si se activa la corrección aprendida, acotado a ±25 %.',
  plan_seguimiento: 'Avance del horizonte del plan y, cuando ya hay datos, su error y sesgo frente a la demanda real.',
  demanda_proyectada_plan: 'Demanda del horizonte que proyectaba el plan al guardarse (a la fecha: la parte del horizonte ya transcurrida).',
  venta_registrada: 'Unidades facturadas en el horizonte; menor que la demanda real si el modelo se agotó.',
  diferencia_plan: 'Demanda real menos proyectada. Positivo: se vendió más de lo previsto.',

  // Ventas
  unidades_netas: 'Facturas menos notas de crédito del periodo, sin flotas especiales salvo que se incluyan.',
  ingresos: 'Suma de la facturación neta del periodo en dólares.',
  precio_promedio: 'Ingresos entre unidades netas.',
  venta_perdida: 'Clientes que no compraron por falta de disponibilidad en el periodo, según los leads.',
  vs_anio_anterior: 'Variación frente al mismo periodo del año anterior.',
} as const
