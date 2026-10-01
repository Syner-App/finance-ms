import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import type { Payable, Supply } from '../generated/prisma/client.ts';
import { MovementCategory, StatusMovement, StatusPayable, TypeMovement } from '../generated/prisma/enums.ts';
import { envs } from '../config/envs.ts';
import {
  failedPrecondition,
  firstOpenPeriod,
  fromDbDate,
  notFound,
  periodOf,
  toDbDate,
  today,
  type PurchaseOrderReceivedEvent,
} from '../common/index.ts';
import { roundTo } from '../calculations/index.ts';
import type { FindPayablesDto, PayPayableDto } from './dto/index.ts';

@Injectable()
export class PayablesService {
  private readonly logger = new Logger(PayablesService.name);

  constructor(private readonly prisma: PrismaService) { }

  // purchase-order.received (orders-ms): the goods arrived, so the bill is owed. It is valued
  // at the reference cost of the supply until the real bill is paid. Idempotent by
  // purchaseOrderId, so a redelivered event creates nothing
  async registerReceived({ organization_id, purchaseOrderId, producto_id, cantidad }: PurchaseOrderReceivedEvent) {
    const date = today(envs.businessTimezone);

    return this.prisma.withTenant(organization_id, async (tx) => {
      const existing = await tx.payable.findUnique({
        where: { organization_id_purchase_order_id: { organization_id, purchase_order_id: purchaseOrderId } },
        select: { id: true },
      });
      if (existing) {
        this.logger.warn(`Purchase order #${purchaseOrderId} already has a payable`);
        return false;
      }

      const supply = await tx.supply.findUnique({
        where: { organization_id_producto_id: { organization_id, producto_id } },
      });

      await tx.payable.create({
        data: {
          organization_id,
          purchase_order_id: purchaseOrderId,
          producto_id,
          supply_id: supply?.id,
          cantidad,
          monto_estimado: supply ? Math.round(cantidad * Number(supply.costo_unitario)) : null,
          fecha_recepcion: toDbDate(date),
          periodo: await firstOpenPeriod(tx, organization_id, periodOf(date)),
        },
      });

      this.logger.log(`Purchase order #${purchaseOrderId}: payable of ${cantidad} units of product #${producto_id}`);
      return true;
    });
  }

  async findPayables({ organization_id, estado, page, limit }: FindPayablesDto) {
    const where = { organization_id, estado };

    const [total, payables, supplies] = await this.prisma.withTenant(organization_id, async (tx) => [
      await tx.payable.count({ where }),
      await tx.payable.findMany({
        where,
        take: limit,
        skip: (page! - 1) * limit!,
        orderBy: { fecha_recepcion: 'desc' },
      }),
      await tx.supply.findMany({ where: { organization_id }, select: { id: true, nombre: true } }),
    ] as const);

    const names = new Map(supplies.map((supply) => [supply.id, supply.nombre]));
    return {
      data: payables.map((payable) => this.toPayableResponse(payable, payable.supply_id ? names.get(payable.supply_id) : undefined)),
      meta: { total, page, lastPage: Math.ceil(total / limit!) },
    };
  }

  // Pays the bill: an expense (MATERIA_PRIMA or EMPAQUES, as its supply) accrued in the
  // period the goods arrived, and the bill sets the new reference cost of the supply
  async payPayable({ organization_id, id, monto_real, cuenta, fecha }: PayPayableDto) {
    const date = fecha ?? today(envs.businessTimezone);

    const { payable, supply } = await this.prisma.withTenant(organization_id, async (tx) => {
      const payable = await tx.payable.findUnique({ where: { id, organization_id } });
      if (!payable) throw notFound(`Payable with id: #${id} not found`);

      // Conditional update: a concurrent payment loses cleanly
      const { count } = await tx.payable.updateMany({
        where: { id, organization_id, estado: StatusPayable.POR_PAGAR },
        data: { estado: StatusPayable.PAGADA, monto_real, pagada_en: toDbDate(date) },
      });
      if (count === 0) throw failedPrecondition(`Payable #${id} is already paid`);

      let supply: Supply | null = null;
      if (payable.supply_id) {
        supply = await tx.supply.findUnique({ where: { id: payable.supply_id, organization_id } });
      }

      await tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.EGRESO,
          categoria: supply?.categoria ?? MovementCategory.MATERIA_PRIMA,
          monto: monto_real,
          periodo: payable.periodo,
          fecha: payable.fecha_recepcion,
          estado: StatusMovement.PAGADO,
          cuenta,
          pagado_en: toDbDate(date),
          descripcion: `Orden de compra ${payable.purchase_order_id}`,
          referencia_id: payable.id,
        },
      });

      if (supply) {
        const costo_unitario = roundTo(monto_real / payable.cantidad, 4);
        if (Number(supply.costo_unitario) !== costo_unitario) {
          supply = await tx.supply.update({ where: { id: supply.id, organization_id }, data: { costo_unitario } });
          await tx.supplyCost.create({
            data: { organization_id, supply_id: supply.id, costo_unitario, origen: `CUENTA_POR_PAGAR ${payable.id}` },
          });
        }
      }

      return { payable: await tx.payable.findUniqueOrThrow({ where: { id, organization_id } }), supply };
    });

    return this.toPayableResponse(payable, supply?.nombre);
  }

  private toPayableResponse(payable: Payable, nombre?: string) {
    return {
      id: payable.id,
      purchase_order_id: payable.purchase_order_id,
      producto_id: payable.producto_id,
      supply_id: payable.supply_id ?? undefined,
      nombre,
      cantidad: payable.cantidad,
      monto_estimado: payable.monto_estimado ?? undefined,
      monto_real: payable.monto_real ?? undefined,
      estado: payable.estado,
      fecha_recepcion: fromDbDate(payable.fecha_recepcion),
      periodo: payable.periodo,
      pagada_en: payable.pagada_en ? fromDbDate(payable.pagada_en) : undefined,
      createdAt: payable.createdAt.toISOString(),
    };
  }
}
