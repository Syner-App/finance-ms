import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { MovementCategory, StatusMovement, StatusStockDeduction, TypeMovement } from '../generated/prisma/enums.ts';
import { OutboxService } from '../outbox/outbox.service.ts';
import { OutboxRelay } from '../outbox/outbox.relay.ts';
import { envs } from '../config/envs.ts';
import {
  assertOpenPeriod,
  failedPrecondition,
  FinanceEvents,
  fromDbDate,
  notFound,
  periodOf,
  toDbDate,
  today,
  type SaleConsumption,
  type SaleRegisteredEvent,
  type SaleStockAppliedEvent,
  type SaleStockRejectedEvent,
} from '../common/index.ts';
import { accumulateConsumption, recipeUnitCost, roundTo } from '../calculations/index.ts';
import type { FindSalesDto, RegisterSaleDto, SaleByIdDto } from './dto/index.ts';

const SALE_INCLUDE = { lines: { include: { recipe: { select: { nombre: true } } }, orderBy: { id: 'asc' } } } as const;

type SaleWithLines = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly outboxRelay: OutboxRelay,
  ) { }

  // Registers the income and, in the same transaction, the finance.sale.registered event
  // that discounts the supplies of the recipes from the products-ms stock. The sale is never
  // reverted by products-ms: the money did come in. Only whole units are discounted; the
  // fraction stays on the supply until it adds up to one
  async registerSale({ organization_id, fecha, cuenta, lineas }: RegisterSaleDto) {
    const date = fecha ?? today(envs.businessTimezone);
    const periodo = periodOf(date);

    const { sale, published } = await this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);

      const recipeIds = [...new Set(lineas.map((line) => line.recipe_id))];
      const recipes = await tx.recipe.findMany({
        where: { organization_id, id: { in: recipeIds } },
        include: { items: true },
      });
      const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
      for (const id of recipeIds) {
        const recipe = recipesById.get(id);
        if (!recipe) throw notFound(`Recipe with id: #${id} not found`);
        if (!recipe.activo) throw failedPrecondition(`Recipe #${id} (${recipe.nombre}) is inactive`);
      }

      // Lock the supplies so concurrent sales accumulate their fractions one after the other
      const supplyIds = [...new Set(recipes.flatMap((recipe) => recipe.items.map((item) => item.supply_id)))];
      await tx.$queryRaw`SELECT "id" FROM "insumos" WHERE "organization_id" = ${organization_id} AND "id" = ANY(${supplyIds}) FOR UPDATE`;
      const supplies = new Map(
        (await tx.supply.findMany({ where: { organization_id, id: { in: supplyIds } } })).map((supply) => [supply.id, supply]),
      );

      const consumed = new Map<number, number>();
      const lines = lineas.map(({ recipe_id, unidades, precio_unitario }) => {
        const recipe = recipesById.get(recipe_id)!;
        for (const item of recipe.items) {
          consumed.set(item.supply_id, (consumed.get(item.supply_id) ?? 0) + unidades * Number(item.cantidad));
        }
        return {
          organization_id,
          recipe_id,
          unidades,
          precio_unitario: precio_unitario ?? recipe.precio_venta,
          costo_unitario: recipeUnitCost(
            recipe.items.map((item) => ({
              cantidad: Number(item.cantidad),
              costo_unitario: Number(supplies.get(item.supply_id)!.costo_unitario),
            })),
          ),
        };
      });

      const consumos: SaleConsumption[] = [];
      for (const [supplyId, consumo] of consumed) {
        const supply = supplies.get(supplyId)!;
        const { descontar, pendiente } = accumulateConsumption(Number(supply.consumo_pendiente), consumo);
        await tx.supply.update({ where: { id: supplyId, organization_id }, data: { consumo_pendiente: pendiente } });
        if (descontar > 0) consumos.push({ producto_id: supply.producto_id, cantidad: descontar });
      }

      const total = lines.reduce((sum, line) => sum + line.unidades * line.precio_unitario, 0);
      const costo_total = Math.round(lines.reduce((sum, line) => sum + line.unidades * line.costo_unitario, 0));

      const sale = await tx.sale.create({
        data: {
          organization_id,
          fecha: toDbDate(date),
          periodo,
          cuenta,
          total,
          costo_total,
          // Nothing to discount yet (only fractions): the stock is already in sync
          estado_stock: consumos.length ? StatusStockDeduction.STOCK_PENDIENTE : StatusStockDeduction.STOCK_APLICADO,
          consumos: consumos as unknown as Prisma.InputJsonValue,
          lines: { create: lines },
        },
        include: SALE_INCLUDE,
      });

      await tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.INGRESO,
          categoria: MovementCategory.VENTAS,
          monto: total,
          periodo,
          fecha: toDbDate(date),
          estado: StatusMovement.PAGADO,
          cuenta,
          pagado_en: toDbDate(date),
          referencia_id: sale.id,
        },
      });

      if (consumos.length) {
        await this.enqueueSaleRegistered(tx, { organization_id, saleId: sale.id, consumos });
      }
      return { sale, published: consumos.length > 0 };
    });

    if (published) this.outboxRelay.kick();
    return this.toSaleResponse(sale);
  }

  async findSales({ organization_id, periodo, estado_stock, page, limit }: FindSalesDto) {
    const where = { organization_id, periodo, estado_stock };

    const [total, sales] = await this.prisma.withTenant(organization_id, async (tx) => [
      await tx.sale.count({ where }),
      await tx.sale.findMany({
        where,
        include: SALE_INCLUDE,
        take: limit,
        skip: (page! - 1) * limit!,
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      }),
    ] as const);

    return {
      data: sales.map((sale) => this.toSaleResponse(sale)),
      meta: { total, page, lastPage: Math.ceil(total / limit!) },
    };
  }

  // Sends the same discount again (same saleId, so products-ms applies it at most once),
  // e.g. after fixing the stock of a rejected sale in products-ms
  async retrySaleStock({ organization_id, id }: SaleByIdDto) {
    const sale = await this.prisma.withTenant(organization_id, async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id, organization_id } });
      if (!sale) throw notFound(`Sale with id: #${id} not found`);

      const { count } = await tx.sale.updateMany({
        where: { id, organization_id, estado_stock: { not: StatusStockDeduction.STOCK_APLICADO } },
        data: { estado_stock: StatusStockDeduction.STOCK_PENDIENTE, motivo_rechazo: null },
      });
      if (count === 0) throw failedPrecondition(`The supplies of sale #${id} were already discounted`);

      await this.enqueueSaleRegistered(tx, {
        organization_id,
        saleId: id,
        consumos: sale.consumos as unknown as SaleConsumption[],
      });

      return tx.sale.findUniqueOrThrow({ where: { id, organization_id }, include: SALE_INCLUDE });
    });

    this.outboxRelay.kick();
    return this.toSaleResponse(sale);
  }

  // Reply of products-ms. Only acts while the discount is pending, so a duplicate delivery
  // is a no-op
  async markStockApplied({ organization_id, saleId }: SaleStockAppliedEvent) {
    const { count } = await this.prisma.withTenant(organization_id, (tx) =>
      tx.sale.updateMany({
        where: { id: saleId, organization_id, estado_stock: StatusStockDeduction.STOCK_PENDIENTE },
        data: { estado_stock: StatusStockDeduction.STOCK_APLICADO, motivo_rechazo: null },
      }),
    );
    if (count === 0) this.logger.warn(`Ignoring stock confirmation of sale #${saleId}: it does not exist or was already processed`);
    else this.logger.log(`Sale #${saleId}: supplies discounted from the stock`);
    return count > 0;
  }

  // The sale stays (the money came in); the dashboard flags the inventory as out of sync
  async markStockRejected({ organization_id, saleId, reason }: SaleStockRejectedEvent) {
    const { count } = await this.prisma.withTenant(organization_id, (tx) =>
      tx.sale.updateMany({
        where: { id: saleId, organization_id, estado_stock: StatusStockDeduction.STOCK_PENDIENTE },
        data: { estado_stock: StatusStockDeduction.STOCK_RECHAZADO, motivo_rechazo: reason },
      }),
    );
    if (count === 0) this.logger.warn(`Ignoring stock rejection of sale #${saleId}: it does not exist or was already processed`);
    else this.logger.warn(`Sale #${saleId}: products-ms rejected the stock discount: ${reason}`);
    return count > 0;
  }

  // Written in the transaction of the sale, so the event commits (or rolls back) with it
  private enqueueSaleRegistered(tx: Prisma.TransactionClient, { organization_id, saleId, consumos }: SaleRegisteredEvent) {
    const payload: Prisma.InputJsonObject = {
      organization_id,
      saleId,
      consumos: consumos.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
    };
    return this.outbox.enqueue(tx, FinanceEvents.SaleRegistered, payload);
  }

  private toSaleResponse(sale: SaleWithLines) {
    return {
      id: sale.id,
      fecha: fromDbDate(sale.fecha),
      periodo: sale.periodo,
      cuenta: sale.cuenta,
      total: sale.total,
      costo_total: sale.costo_total,
      estado_stock: sale.estado_stock,
      motivo_rechazo: sale.motivo_rechazo ?? undefined,
      lineas: sale.lines.map((line) => ({
        recipe_id: line.recipe_id,
        nombre: line.recipe.nombre,
        unidades: line.unidades,
        precio_unitario: line.precio_unitario,
        costo_unitario: roundTo(Number(line.costo_unitario), 4),
        subtotal: line.unidades * line.precio_unitario,
      })),
      consumos: sale.consumos as unknown as SaleConsumption[],
      createdAt: sale.createdAt.toISOString(),
    };
  }
}
