import { ceilUnits, roundTo } from './rounding.ts';

export interface BreakEvenInput {
  precio: number;
  // Variable cost per unit sold (recipes or manual)
  cvu: number;
  costosFijos: number;
  diasOperacion: number;
  cuotaAsignada: number;
}

//   Margen de contribución unitario = precio − costo variable unitario
//   Punto de equilibrio mensual (unidades) = costos fijos / margen unitario
// "Con crédito" also covers the installment: what must be sold not to lose cash
export function breakEven({ precio, cvu, costosFijos, diasOperacion, cuotaAsignada }: BreakEvenInput) {
  const margen = roundTo(precio - cvu, 4);
  const razon = precio > 0 ? margen / precio : 0;
  const base = {
    precio_promedio: precio,
    costo_variable_unitario: roundTo(cvu, 4),
    margen_contribucion_unitario: margen,
    razon_contribucion: roundTo(razon, 4),
    costos_fijos: costosFijos,
    dias_operacion: diasOperacion,
    cuota_asignada: cuotaAsignada,
  };

  if (margen <= 0) {
    return {
      ...base,
      alcanzable: false as const,
      mensaje: 'El precio no cubre el costo variable: el punto de equilibrio es inalcanzable',
    };
  }

  const pe_unidades = ceilUnits(costosFijos / margen);
  const pe_credito_unidades = ceilUnits((costosFijos + cuotaAsignada) / margen);

  return {
    ...base,
    alcanzable: true as const,
    pe_unidades,
    pe_dinero: Math.round(costosFijos / razon),
    pe_diario: ceilUnits(pe_unidades / diasOperacion),
    pe_credito_unidades,
    pe_credito_dinero: Math.round((costosFijos + cuotaAsignada) / razon),
    pe_credito_diario: ceilUnits(pe_credito_unidades / diasOperacion),
  };
}

export type BreakEvenResult = ReturnType<typeof breakEven>;
