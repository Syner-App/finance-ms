import { MovementCategory } from '../generated/prisma/enums.ts';
import { OPERATING_EXPENSES } from '../common/categories.ts';

export interface CategoryTotal {
  categoria: MovementCategory;
  monto: number;
}

export interface IncomeStatementInput {
  // Accrued amounts of the period by category: sales, operating expenses (paid or
  // pending) and the unpaid payables. Other categories are ignored
  totals: readonly CategoryTotal[];
  // Operating expense categories counted as variable costs (the rest are fixed)
  variableCategories: readonly MovementCategory[];
  // Credit installment assigned to the business for the period
  cuotaCredito: number;
}

//   Ventas − costos variables = margen de contribución
//   − gastos fijos = utilidad operativa (= ventas − costos y gastos operativos)
//   − cuota asignada del crédito = flujo disponible
// Withdrawals, contributions, reserve transfers and prepayments are uses of the money,
// never expenses, so they do not appear here
export function incomeStatement({ totals, variableCategories, cuotaCredito }: IncomeStatementInput) {
  const byCategory = new Map<MovementCategory, number>();
  for (const { categoria, monto } of totals) {
    byCategory.set(categoria, (byCategory.get(categoria) ?? 0) + monto);
  }

  const ventas = byCategory.get(MovementCategory.VENTAS) ?? 0;
  let costos_variables = 0;
  let gastos_fijos = 0;
  for (const categoria of OPERATING_EXPENSES) {
    const monto = byCategory.get(categoria) ?? 0;
    if (variableCategories.includes(categoria)) costos_variables += monto;
    else gastos_fijos += monto;
  }

  const margen_contribucion = ventas - costos_variables;
  const utilidad_operativa = margen_contribucion - gastos_fijos;

  return {
    ventas,
    costos_variables,
    margen_contribucion,
    gastos_fijos,
    utilidad_operativa,
    cuota_credito: cuotaCredito,
    flujo_disponible: utilidad_operativa - cuotaCredito,
    detalle: [MovementCategory.VENTAS, ...OPERATING_EXPENSES]
      .filter((categoria) => byCategory.has(categoria))
      .map((categoria) => ({ categoria, monto: byCategory.get(categoria)! })),
  };
}
