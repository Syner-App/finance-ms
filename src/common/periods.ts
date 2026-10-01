import type { Prisma } from '../generated/prisma/client.ts';
import { StatusPeriod } from '../generated/prisma/enums.ts';
import { failedPrecondition } from './rpc-errors.ts';

// A closed period keeps the figures it had when it was closed: nothing accrued in it can be
// registered until the owner reopens it
export async function assertOpenPeriod(tx: Prisma.TransactionClient, organization_id: string, periodo: string) {
  const period = await tx.period.findUnique({
    where: { organization_id_periodo: { organization_id, periodo } },
    select: { estado: true },
  });
  if (period?.estado === StatusPeriod.CERRADO) {
    throw failedPrecondition(`The period ${periodo} is closed; reopen it to register movements in it`);
  }
}

const nextPeriod = (periodo: string) => {
  const [year, month] = periodo.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
};

// For records that arrive on their own (events): the period itself, or the first open one
// after it when it was already closed
export async function firstOpenPeriod(tx: Prisma.TransactionClient, organization_id: string, periodo: string) {
  const closed = new Set(
    (
      await tx.period.findMany({
        where: { organization_id, estado: StatusPeriod.CERRADO, periodo: { gte: periodo } },
        select: { periodo: true },
      })
    ).map((period) => period.periodo),
  );

  let candidate = periodo;
  while (closed.has(candidate)) candidate = nextPeriod(candidate);
  return candidate;
}
