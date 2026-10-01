import { ceilUnits, roundTo } from './rounding.ts';

export type ScenarioResult = 'PERDIDA' | 'CUBRE_OPERACION' | 'GANANCIA';

// Average consumption of a supply per unit sold (products-ms units)
export interface ScenarioSupplyRate {
  producto_id: number;
  nombre: string;
  cantidad_por_unidad: number;
  costo_unitario: number;
}

export interface ScenariosInput {
  niveles: readonly number[];
  precio: number;
  cvu: number;
  costosFijos: number;
  diasOperacion: number;
  cuotaAsignada: number;
  faltanteReserva: number;
  inversionInicial: number;
  insumos: readonly ScenarioSupplyRate[];
}

// Monthly projection for each level of daily sales
export function scenarios(input: ScenariosInput) {
  const { precio, cvu, costosFijos, diasOperacion, cuotaAsignada, faltanteReserva, inversionInicial } = input;

  return input.niveles.map((unidades_diarias) => {
    const unidades_mes = unidades_diarias * diasOperacion;
    const ventas = unidades_mes * precio;
    const costos_variables = Math.round(unidades_mes * cvu);
    const utilidad_operativa = ventas - costos_variables - costosFijos;
    const flujo_disponible = utilidad_operativa - cuotaAsignada;
    const aporte_reserva = Math.max(0, Math.min(flujo_disponible, faltanteReserva));

    const resultado: ScenarioResult =
      utilidad_operativa < 0 ? 'PERDIDA' : flujo_disponible < 0 ? 'CUBRE_OPERACION' : 'GANANCIA';

    return {
      unidades_diarias,
      unidades_mes,
      ventas,
      costos_variables,
      gastos_fijos: costosFijos,
      utilidad_operativa,
      cuota_credito: cuotaAsignada,
      flujo_disponible,
      aporte_reserva,
      distribuible_estimado: Math.max(0, flujo_disponible - aporte_reserva),
      meses_recuperacion: flujo_disponible > 0 ? roundTo(inversionInicial / flujo_disponible, 1) : undefined,
      resultado,
      insumos: input.insumos.map(({ producto_id, nombre, cantidad_por_unidad, costo_unitario }) => {
        const cantidad = unidades_mes * cantidad_por_unidad;
        return {
          producto_id,
          nombre,
          cantidad_mensual: ceilUnits(cantidad),
          costo_mensual: Math.round(cantidad * costo_unitario),
        };
      }),
    };
  });
}
