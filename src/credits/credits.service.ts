import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import { MovementCategory, StatusMovement, TypeMovement } from '../generated/prisma/enums.ts';
import { envs } from '../config/envs.ts';
import { assertOpenPeriod, failedPrecondition, invalidArgument, notFound, periodOf, toDbDate, today } from '../common/index.ts';
import { installmentStatus, paidInstallments, toCreditResponse } from './credit.queries.ts';
import type { CreateCreditDto, PayInstallmentDto } from './dto/index.ts';

// Extraordinary payments (PrepayCredit) depend on the waterfall: see TreasuryService
@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) { }

  async createCredit({ organization_id, cuota_asignada, cuota_mensual, ...data }: CreateCreditDto) {
    if (cuota_asignada > cuota_mensual) {
      throw invalidArgument('cuota_asignada cannot be greater than cuota_mensual');
    }
    const credit = await this.prisma.withTenant(organization_id, (tx) =>
      tx.credit.create({ data: { organization_id, cuota_asignada, cuota_mensual, ...data } }),
    );
    return toCreditResponse(credit, { pagada: 0, pendiente: credit.cuota_asignada });
  }

  async findCredits(organization_id: string) {
    const periodo = periodOf(today(envs.businessTimezone));
    return this.prisma.withTenant(organization_id, async (tx) => {
      const { credits, status } = await installmentStatus(tx, organization_id, periodo);
      return { data: credits.map((credit) => toCreditResponse(credit, status.get(credit.id))) };
    });
  }

  // Ordinary installment: a financial obligation, not an operating expense. abono_capital is
  // the part of it that lowers the principal
  async payInstallment({ organization_id, id, cuenta, monto, abono_capital = 0, fecha }: PayInstallmentDto) {
    const date = fecha ?? today(envs.businessTimezone);
    const periodo = periodOf(date);
    if (abono_capital > monto) throw invalidArgument('abono_capital cannot be greater than monto');

    return this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);

      const credit = await tx.credit.findUnique({ where: { id, organization_id } });
      if (!credit) throw notFound(`Credit with id: #${id} not found`);
      if (!credit.activo) throw failedPrecondition(`Credit #${id} is already paid off`);
      if (abono_capital > credit.saldo_capital) {
        throw failedPrecondition(`abono_capital (${abono_capital}) is greater than the principal (${credit.saldo_capital})`);
      }

      await tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.EGRESO,
          categoria: MovementCategory.CUOTA_CREDITO,
          monto,
          periodo,
          fecha: toDbDate(date),
          estado: StatusMovement.PAGADO,
          cuenta,
          pagado_en: toDbDate(date),
          descripcion: `Cuota ${credit.nombre}`,
          referencia_id: credit.id,
        },
      });

      const saldo_capital = credit.saldo_capital - abono_capital;
      const updated = await tx.credit.update({
        where: { id, organization_id },
        data: { saldo_capital, activo: saldo_capital > 0 },
      });
      return toCreditResponse(updated, await paidInstallments(tx, organization_id, updated, periodo));
    });
  }
}
