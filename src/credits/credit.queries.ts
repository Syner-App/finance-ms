import type { Credit, Prisma } from '../generated/prisma/client.ts';
import { MovementCategory, StatusMovement } from '../generated/prisma/enums.ts';

export interface InstallmentStatus {
  pagada: number;
  pendiente: number;
}

// Installments of the period: what each active credit assigns to the business, what was
// paid and what is still pending
export async function installmentStatus(tx: Prisma.TransactionClient, organization_id: string, periodo: string) {
  const credits = await tx.credit.findMany({ where: { organization_id, activo: true }, orderBy: { createdAt: 'asc' } });
  const paid = await tx.movement.groupBy({
    by: ['referencia_id'],
    where: { organization_id, periodo, categoria: MovementCategory.CUOTA_CREDITO, estado: StatusMovement.PAGADO },
    _sum: { monto: true },
  });
  const paidByCredit = new Map(paid.map((row) => [row.referencia_id, row._sum.monto ?? 0]));

  const status = new Map<string, InstallmentStatus>();
  for (const credit of credits) {
    const pagada = paidByCredit.get(credit.id) ?? 0;
    status.set(credit.id, { pagada, pendiente: Math.max(0, credit.cuota_asignada - pagada) });
  }

  return {
    credits,
    status,
    cuotaAsignada: credits.reduce((total, credit) => total + credit.cuota_asignada, 0),
    cuotaPendiente: [...status.values()].reduce((total, { pendiente }) => total + pendiente, 0),
  };
}

export const toCreditResponse = (credit: Credit, status: InstallmentStatus = { pagada: 0, pendiente: 0 }) => ({
  id: credit.id,
  nombre: credit.nombre,
  saldo_capital: credit.saldo_capital,
  cuota_mensual: credit.cuota_mensual,
  cuota_asignada: credit.cuota_asignada,
  dia_pago: credit.dia_pago,
  activo: credit.activo,
  cuota_pagada_periodo: status.pagada,
  cuota_pendiente_periodo: status.pendiente,
  createdAt: credit.createdAt.toISOString(),
});

// Paid installments of a credit in a period
export async function paidInstallments(tx: Prisma.TransactionClient, organization_id: string, credit: Credit, periodo: string) {
  const { _sum } = await tx.movement.aggregate({
    where: {
      organization_id,
      periodo,
      referencia_id: credit.id,
      categoria: MovementCategory.CUOTA_CREDITO,
      estado: StatusMovement.PAGADO,
    },
    _sum: { monto: true },
  });
  const pagada = _sum.monto ?? 0;
  return { pagada, pendiente: credit.activo ? Math.max(0, credit.cuota_asignada - pagada) : 0 };
}
