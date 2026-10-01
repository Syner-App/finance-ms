import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Prisma } from '../generated/prisma/client.ts';
import { Account, MovementCategory, StatusPeriod, StatusStockDeduction, TypeMovement } from '../generated/prisma/enums.ts';
import { SalesService } from './sales.service.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { OutboxService } from '../outbox/outbox.service.ts';
import { OutboxRelay } from '../outbox/outbox.relay.ts';
import { FinanceEvents } from '../common/index.ts';

const organization_id = '6abd26a42d059ac027376ca1';
const saleId = '5f0c6b8e-1d3a-4f6e-9b2a-7c1d2e3f4a5b';

// Granizado 12 oz: 0.05 bags of ice (products-ms #7) and one cup (#8)
const recipe = {
  id: 1,
  organization_id,
  nombre: 'Granizado 12 oz',
  precio_venta: 5000,
  activo: true,
  items: [
    { supply_id: 10, cantidad: new Prisma.Decimal(0.05) },
    { supply_id: 11, cantidad: new Prisma.Decimal(1) },
  ],
};
const supplies = [
  { id: 10, producto_id: 7, costo_unitario: new Prisma.Decimal(6000), consumo_pendiente: new Prisma.Decimal(0) },
  { id: 11, producto_id: 8, costo_unitario: new Prisma.Decimal(350), consumo_pendiente: new Prisma.Decimal(0) },
];

describe('SalesService', () => {
  let service: SalesService;

  const tx = {
    period: { findUnique: vi.fn() },
    recipe: { findMany: vi.fn() },
    supply: { findMany: vi.fn(), update: vi.fn() },
    sale: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    movement: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const prisma = { withTenant: (_organizationId: string, callback: (client: typeof tx) => unknown) => callback(tx) };
  const outbox = { enqueue: vi.fn() };
  const outboxRelay = { kick: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    tx.period.findUnique.mockResolvedValue(null);
    tx.recipe.findMany.mockResolvedValue([recipe]);
    tx.supply.findMany.mockResolvedValue(supplies);
    tx.sale.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        id: saleId,
        fecha: data.fecha,
        motivo_rechazo: null,
        createdAt: new Date(),
        lines: data.lines.create.map((line: object) => ({ ...line, recipe: { nombre: recipe.nombre } })),
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
        { provide: OutboxRelay, useValue: outboxRelay },
      ],
    }).compile();

    service = module.get(SalesService);
  });

  it('registers the income and enqueues the whole units to discount from the stock', async () => {
    const sale = await service.registerSale({
      organization_id,
      fecha: '2026-10-01',
      cuenta: Account.CAJA,
      lineas: [{ recipe_id: 1, unidades: 30 }],
    });

    // 30 × 0.05 = 1.5 bags: 1 is discounted and 0.5 stays pending; 30 cups
    expect(tx.supply.update).toHaveBeenCalledWith({ where: { id: 10, organization_id }, data: { consumo_pendiente: 0.5 } });
    expect(tx.supply.update).toHaveBeenCalledWith({ where: { id: 11, organization_id }, data: { consumo_pendiente: 0 } });
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, FinanceEvents.SaleRegistered, {
      organization_id,
      saleId,
      consumos: [
        { producto_id: 7, cantidad: 1 },
        { producto_id: 8, cantidad: 30 },
      ],
    });
    expect(tx.movement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: TypeMovement.INGRESO,
        categoria: MovementCategory.VENTAS,
        monto: 150_000,
        periodo: '2026-10',
        cuenta: Account.CAJA,
        referencia_id: saleId,
      }),
    });
    expect(outboxRelay.kick).toHaveBeenCalled();
    expect(sale).toMatchObject({
      total: 150_000,
      // (0.05 × 6000 + 350) × 30
      costo_total: 19_500,
      estado_stock: StatusStockDeduction.STOCK_PENDIENTE,
      lineas: [{ recipe_id: 1, nombre: 'Granizado 12 oz', unidades: 30, precio_unitario: 5000, costo_unitario: 650, subtotal: 150_000 }],
    });
  });

  it('locks the supplies before reading their pending fractions', async () => {
    await service.registerSale({ organization_id, cuenta: Account.CAJA, lineas: [{ recipe_id: 1, unidades: 1 }] });

    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.supply.findMany.mock.invocationCallOrder[0]);
  });

  it('keeps the sale in sync without an event when only fractions were consumed', async () => {
    tx.recipe.findMany.mockResolvedValue([{ ...recipe, items: [recipe.items[0]] }]);

    const sale = await service.registerSale({ organization_id, cuenta: Account.BANCO, lineas: [{ recipe_id: 1, unidades: 10 }] });

    expect(sale.estado_stock).toBe(StatusStockDeduction.STOCK_APLICADO);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(outboxRelay.kick).not.toHaveBeenCalled();
  });

  it('uses the price sent for the line instead of the recipe price', async () => {
    const sale = await service.registerSale({
      organization_id,
      cuenta: Account.CAJA,
      lineas: [{ recipe_id: 1, unidades: 2, precio_unitario: 4500 }],
    });

    expect(sale.total).toBe(9000);
  });

  it.each([
    ['an unknown recipe', () => tx.recipe.findMany.mockResolvedValue([]), status.NOT_FOUND],
    ['an inactive recipe', () => tx.recipe.findMany.mockResolvedValue([{ ...recipe, activo: false }]), status.FAILED_PRECONDITION],
    ['a closed period', () => tx.period.findUnique.mockResolvedValue({ estado: StatusPeriod.CERRADO }), status.FAILED_PRECONDITION],
  ])('rejects a sale of %s', async (_case, arrange, code) => {
    arrange();

    const error = await service
      .registerSale({ organization_id, cuenta: Account.CAJA, lineas: [{ recipe_id: 1, unidades: 1 }] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toMatchObject({ code });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  describe('stock replies', () => {
    it('applies a confirmation only while the discount is pending', async () => {
      tx.sale.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(service.markStockApplied({ organization_id, saleId })).resolves.toBe(true);
      await expect(service.markStockApplied({ organization_id, saleId })).resolves.toBe(false);
      expect(tx.sale.updateMany).toHaveBeenCalledWith({
        where: { id: saleId, organization_id, estado_stock: StatusStockDeduction.STOCK_PENDIENTE },
        data: { estado_stock: StatusStockDeduction.STOCK_APLICADO, motivo_rechazo: null },
      });
    });

    it('keeps the sale and records why products-ms rejected the discount', async () => {
      tx.sale.updateMany.mockResolvedValue({ count: 1 });

      await service.markStockRejected({ organization_id, saleId, reason: 'Insufficient stock for product #7' });

      expect(tx.sale.updateMany).toHaveBeenCalledWith({
        where: { id: saleId, organization_id, estado_stock: StatusStockDeduction.STOCK_PENDIENTE },
        data: { estado_stock: StatusStockDeduction.STOCK_RECHAZADO, motivo_rechazo: 'Insufficient stock for product #7' },
      });
    });
  });

  describe('retrySaleStock', () => {
    const consumos = [{ producto_id: 7, cantidad: 1 }];

    beforeEach(() => {
      tx.sale.findUnique.mockResolvedValue({ id: saleId, consumos });
      tx.sale.findUniqueOrThrow.mockResolvedValue({
        id: saleId,
        fecha: new Date('2026-10-01'),
        consumos,
        lines: [],
        createdAt: new Date(),
        estado_stock: StatusStockDeduction.STOCK_PENDIENTE,
        motivo_rechazo: null,
      });
    });

    it('sends the same discount again with the same saleId', async () => {
      tx.sale.updateMany.mockResolvedValue({ count: 1 });

      await service.retrySaleStock({ organization_id, id: saleId });

      expect(outbox.enqueue).toHaveBeenCalledWith(tx, FinanceEvents.SaleRegistered, { organization_id, saleId, consumos });
      expect(outboxRelay.kick).toHaveBeenCalled();
    });

    it('refuses a sale whose supplies were already discounted', async () => {
      tx.sale.updateMany.mockResolvedValue({ count: 0 });

      const error = await service.retrySaleStock({ organization_id, id: saleId }).catch((e: unknown) => e);

      expect((error as RpcException).getError()).toMatchObject({ code: status.FAILED_PRECONDITION });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });
});
