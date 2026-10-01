import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.ts';
import { Account, MovementCategory, StatusMovement, TypeMovement } from '../generated/prisma/enums.ts';
import { envs } from '../config/envs.ts';
import {
  assertOpenPeriod,
  failedPrecondition,
  isOperatingExpense,
  notFound,
  periodOf,
  toDbDate,
  today,
} from '../common/index.ts';
import { assertBalance, lockTreasury } from './balances.ts';
import { toMovementResponse } from './movement.response.ts';
import type {
  FindMovementsDto,
  PayExpenseDto,
  RegisterContributionDto,
  RegisterExpenseDto,
  TransferReserveDto,
} from './dto/index.ts';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) { }

  // Operating expense, paid now or accrued (PENDIENTE) to be paid later
  async registerExpense({ organization_id, categoria, monto, fecha, pagado, cuenta, descripcion }: RegisterExpenseDto) {
    const date = fecha ?? today(envs.businessTimezone);
    const periodo = periodOf(date);

    const movement = await this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);
      return tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.EGRESO,
          categoria,
          monto,
          periodo,
          fecha: toDbDate(date),
          estado: pagado ? StatusMovement.PAGADO : StatusMovement.PENDIENTE,
          cuenta: pagado ? cuenta : null,
          pagado_en: pagado ? toDbDate(date) : null,
          descripcion,
        },
      });
    });
    return toMovementResponse(movement);
  }

  // Pays an accrued expense. Its period does not change (it was already counted there), so
  // an expense of a closed period can still be paid
  async payExpense({ organization_id, id, cuenta, fecha }: PayExpenseDto) {
    const date = fecha ?? today(envs.businessTimezone);

    const movement = await this.prisma.withTenant(organization_id, async (tx) => {
      const expense = await tx.movement.findUnique({ where: { id, organization_id } });
      if (!expense || !isOperatingExpense(expense.categoria)) {
        throw notFound(`Expense with id: #${id} not found`);
      }

      // Conditional update: a concurrent payment loses cleanly
      const { count } = await tx.movement.updateMany({
        where: { id, organization_id, estado: StatusMovement.PENDIENTE },
        data: { estado: StatusMovement.PAGADO, cuenta, pagado_en: toDbDate(date) },
      });
      if (count === 0) throw failedPrecondition(`Expense #${id} is already paid`);

      return tx.movement.findUniqueOrThrow({ where: { id, organization_id } });
    });
    return toMovementResponse(movement);
  }

  async registerContribution({ organization_id, monto, cuenta, fecha, descripcion }: RegisterContributionDto) {
    const date = fecha ?? today(envs.businessTimezone);
    const periodo = periodOf(date);

    const movement = await this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);
      return tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.INGRESO,
          categoria: MovementCategory.APORTE_PROPIETARIO,
          monto,
          periodo,
          fecha: toDbDate(date),
          estado: StatusMovement.PAGADO,
          cuenta,
          pagado_en: toDbDate(date),
          descripcion,
        },
      });
    });
    return toMovementResponse(movement);
  }

  // Moves money between CAJA/BANCO and the reserve: two paid movements (out of one account,
  // into the other) that share referencia_id. Never part of the operating profit
  async transferReserve({ organization_id, monto, cuenta, hacia_reserva = true, fecha }: TransferReserveDto) {
    const date = fecha ?? today(envs.businessTimezone);
    const periodo = periodOf(date);
    const [from, to] = hacia_reserva ? [cuenta, Account.RESERVA] : [Account.RESERVA, cuenta];

    const movements = await this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);
      await lockTreasury(tx, organization_id);
      await assertBalance(tx, organization_id, from, monto);

      const referencia_id = randomUUID();
      const base = {
        organization_id,
        categoria: MovementCategory.TRASLADO_RESERVA,
        monto,
        periodo,
        fecha: toDbDate(date),
        estado: StatusMovement.PAGADO,
        pagado_en: toDbDate(date),
        referencia_id,
        descripcion: hacia_reserva ? `Traslado de ${from} a la reserva` : `Traslado de la reserva a ${to}`,
      };
      return [
        await tx.movement.create({ data: { ...base, tipo: TypeMovement.EGRESO, cuenta: from } }),
        await tx.movement.create({ data: { ...base, tipo: TypeMovement.INGRESO, cuenta: to } }),
      ];
    });

    return {
      data: movements.map(toMovementResponse),
      meta: { total: movements.length, page: 1, lastPage: 1 },
    };
  }

  async findMovements({ organization_id, periodo, categoria, estado, page, limit }: FindMovementsDto) {
    const where = { organization_id, periodo, categoria, estado };

    const [total, movements] = await this.prisma.withTenant(organization_id, async (tx) => [
      await tx.movement.count({ where }),
      await tx.movement.findMany({
        where,
        take: limit,
        skip: (page! - 1) * limit!,
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      }),
    ] as const);

    return {
      data: movements.map(toMovementResponse),
      meta: { total, page, lastPage: Math.ceil(total / limit!) },
    };
  }
}
