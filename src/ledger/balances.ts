import type { Prisma } from '../generated/prisma/client.ts';
import { Account, StatusMovement, TypeMovement } from '../generated/prisma/enums.ts';
import { failedPrecondition } from '../common/rpc-errors.ts';

export type Balances = Record<Account, number>;

// Balance of each account: only paid movements move money
export async function accountBalances(tx: Prisma.TransactionClient, organization_id: string): Promise<Balances> {
  const rows = await tx.movement.groupBy({
    by: ['cuenta', 'tipo'],
    where: { organization_id, estado: StatusMovement.PAGADO, cuenta: { not: null } },
    _sum: { monto: true },
  });

  const balances: Balances = { [Account.CAJA]: 0, [Account.BANCO]: 0, [Account.RESERVA]: 0 };
  for (const { cuenta, tipo, _sum } of rows) {
    if (!cuenta) continue;
    balances[cuenta] += (tipo === TypeMovement.INGRESO ? 1 : -1) * (_sum.monto ?? 0);
  }
  return balances;
}

export async function assertBalance(tx: Prisma.TransactionClient, organization_id: string, cuenta: Account, monto: number) {
  const balances = await accountBalances(tx, organization_id);
  if (balances[cuenta] < monto) {
    throw failedPrecondition(`${cuenta} has ${balances[cuenta]} and ${monto} was requested`);
  }
}

// Serializes the money decisions of an organization (withdrawals, prepayments, transfers):
// two concurrent withdrawals cannot both spend the same surplus. Released at commit
export async function lockTreasury(tx: Prisma.TransactionClient, organization_id: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance:${organization_id}`}))::text`;
}
