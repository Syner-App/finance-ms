import { ceilUnits, roundTo, sum } from './rounding.ts';

// One supply, with its stock read from products-ms and its open purchase orders from orders-ms
export interface ReplenishmentInput {
  producto_id: number;
  nombre: string;
  costo_unitario: number;
  consumo_diario: number;
  stock_actual: number;
  stock_minimo: number;
  en_ordenes_abiertas: number;
}

//   necesidad = consumo diario × días de cobertura + stock mínimo
//   faltante  = max(0, necesidad − stock actual − en órdenes abiertas)
// The open purchase orders are already a commitment (step 1 of the waterfall), so they
// are subtracted here to not count them twice
export function replenishment(items: readonly ReplenishmentInput[], diasCobertura: number) {
  const detail = items.map((item) => {
    const necesidad = roundTo(item.consumo_diario * diasCobertura + item.stock_minimo, 4);
    const faltante = Math.max(0, ceilUnits(necesidad - item.stock_actual - item.en_ordenes_abiertas));
    return {
      ...item,
      consumo_diario: roundTo(item.consumo_diario, 4),
      necesidad,
      faltante,
      valor: Math.round(faltante * item.costo_unitario),
      compromiso: Math.round(item.en_ordenes_abiertas * item.costo_unitario),
    };
  });

  return {
    items: detail,
    reposicion: sum(detail.map((item) => item.valor)),
    compromisos: sum(detail.map((item) => item.compromiso)),
  };
}

// Fallback when products-ms or orders-ms do not answer: days of coverage of the average
// daily sales at the variable unit cost
export const estimatedReplenishment = (diasCobertura: number, unidadesDiarias: number, cvu: number) =>
  Math.round(diasCobertura * unidadesDiarias * cvu);
