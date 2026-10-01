import type { Prisma } from '../generated/prisma/client.ts';
import { MovementCategory, StatusMovement, StatusPayable } from '../generated/prisma/enums.ts';
import { OPERATING_EXPENSES } from '../common/categories.ts';
import { weightedUnitCost, type CategoryTotal } from '../calculations/index.ts';

// Categories of the income statement: sales and operating expenses
const ACCRUAL_CATEGORIES = [MovementCategory.VENTAS, ...OPERATING_EXPENSES];

// Unpaid payables are accrued at their estimate, in the category of their supply
async function pendingPayables(tx: Prisma.TransactionClient, organization_id: string, periodo?: string) {
  const payables = await tx.payable.findMany({
    where: { organization_id, estado: StatusPayable.POR_PAGAR, ...(periodo && { periodo }) },
    select: { periodo: true, monto_estimado: true, supply_id: true },
  });

  const supplyIds = [...new Set(payables.flatMap((payable) => (payable.supply_id ? [payable.supply_id] : [])))];
  const supplies = await tx.supply.findMany({
    where: { organization_id, id: { in: supplyIds } },
    select: { id: true, categoria: true },
  });
  const categories = new Map(supplies.map((supply) => [supply.id, supply.categoria]));

  return payables.map((payable) => ({
    periodo: payable.periodo,
    categoria: (payable.supply_id && categories.get(payable.supply_id)) || MovementCategory.MATERIA_PRIMA,
    monto: payable.monto_estimado ?? 0,
    sinValorar: payable.monto_estimado === null,
  }));
}

// Accrued sales and operating expenses (paid or pending) plus the unpaid payables, of one
// period or (no periodo) since the beginning
export async function accruedTotals(tx: Prisma.TransactionClient, organization_id: string, periodo?: string) {
  const movements = await tx.movement.groupBy({
    by: ['categoria'],
    where: { organization_id, categoria: { in: ACCRUAL_CATEGORIES }, ...(periodo && { periodo }) },
    _sum: { monto: true },
  });
  const payables = await pendingPayables(tx, organization_id, periodo);

  const totals: CategoryTotal[] = [
    ...movements.map(({ categoria, _sum }) => ({ categoria, monto: _sum.monto ?? 0 })),
    ...payables.map(({ categoria, monto }) => ({ categoria, monto })),
  ];
  return {
    totals,
    cuentasPorPagar: payables.reduce((total, payable) => total + payable.monto, 0),
    sinValorar: payables.filter((payable) => payable.sinValorar).length,
  };
}

// Accrued totals and paid installments of every period, in chronological order
export async function accruedTotalsByPeriod(tx: Prisma.TransactionClient, organization_id: string) {
  const movements = await tx.movement.groupBy({
    by: ['periodo', 'categoria'],
    where: { organization_id, categoria: { in: [...ACCRUAL_CATEGORIES, MovementCategory.CUOTA_CREDITO] } },
    _sum: { monto: true },
  });
  const payables = await pendingPayables(tx, organization_id);

  const periods = new Map<string, { totals: CategoryTotal[]; cuotasPagadas: number }>();
  const periodOf = (periodo: string) => {
    if (!periods.has(periodo)) periods.set(periodo, { totals: [], cuotasPagadas: 0 });
    return periods.get(periodo)!;
  };

  for (const { periodo, categoria, _sum } of movements) {
    const entry = periodOf(periodo);
    if (categoria === MovementCategory.CUOTA_CREDITO) entry.cuotasPagadas += _sum.monto ?? 0;
    else entry.totals.push({ categoria, monto: _sum.monto ?? 0 });
  }
  for (const { periodo, categoria, monto } of payables) periodOf(periodo).totals.push({ categoria, monto });

  return [...periods.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export async function sumMovements(tx: Prisma.TransactionClient, where: Prisma.MovementWhereInput) {
  const { _sum } = await tx.movement.aggregate({ where, _sum: { monto: true } });
  return _sum.monto ?? 0;
}

// Accrued operating expenses not paid yet
export const pendingExpenses = (tx: Prisma.TransactionClient, organization_id: string) =>
  sumMovements(tx, { organization_id, estado: StatusMovement.PENDIENTE, categoria: { in: [...OPERATING_EXPENSES] } });

// Sales of [from, to]: units, consumption of each supply (current recipes) and the variable
// unit cost weighted by the units of each recipe
export async function salesStats(tx: Prisma.TransactionClient, organization_id: string, from: Date, to: Date) {
  const lines = await tx.saleLine.findMany({
    where: { organization_id, sale: { fecha: { gte: from, lte: to } } },
    select: {
      unidades: true,
      costo_unitario: true,
      recipe: { select: { items: { select: { supply_id: true, cantidad: true } } } },
    },
  });

  const consumption = new Map<number, number>();
  for (const line of lines) {
    for (const item of line.recipe.items) {
      consumption.set(item.supply_id, (consumption.get(item.supply_id) ?? 0) + line.unidades * Number(item.cantidad));
    }
  }

  return {
    unidades: lines.reduce((total, line) => total + line.unidades, 0),
    consumption,
    cvu: weightedUnitCost(lines.map((line) => ({ unidades: line.unidades, costo_unitario: Number(line.costo_unitario) }))),
  };
}

export type SalesStats = Awaited<ReturnType<typeof salesStats>>;
