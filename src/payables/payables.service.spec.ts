import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Prisma } from '../generated/prisma/client.ts';
import { Account, MovementCategory, StatusPayable, StatusPeriod, TypeMovement } from '../generated/prisma/enums.ts';
import { PayablesService } from './payables.service.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { envs } from '../config/envs.ts';
import { periodOf, today } from '../common/index.ts';

const organization_id = '6abd26a42d059ac027376ca1';
const purchaseOrderId = '0d6b1c1e-7f0a-4b8e-9c3d-2a1b0c9d8e7f';
const payableId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const supply = {
  id: 10,
  producto_id: 8,
  nombre: 'Vasos 12 oz',
  categoria: MovementCategory.EMPAQUES,
  costo_unitario: new Prisma.Decimal(350),
};

describe('PayablesService', () => {
  let service: PayablesService;

  const tx = {
    payable: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    supply: { findUnique: vi.fn(), update: vi.fn() },
    supplyCost: { create: vi.fn() },
    movement: { create: vi.fn() },
    period: { findMany: vi.fn() },
  };
  const prisma = { withTenant: (_organizationId: string, callback: (client: typeof tx) => unknown) => callback(tx) };

  beforeEach(async () => {
    vi.resetAllMocks();
    tx.period.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayablesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PayablesService);
  });

  describe('registerReceived (purchase-order.received)', () => {
    const event = { organization_id, purchaseOrderId, producto_id: 8, cantidad: 1000 };

    it('creates the payable valued at the reference cost of the supply', async () => {
      tx.payable.findUnique.mockResolvedValue(null);
      tx.supply.findUnique.mockResolvedValue(supply);

      await expect(service.registerReceived(event)).resolves.toBe(true);

      expect(tx.payable.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id,
          purchase_order_id: purchaseOrderId,
          producto_id: 8,
          supply_id: 10,
          cantidad: 1000,
          monto_estimado: 350_000,
        }),
      });
    });

    it('leaves the payable without estimate when the product is not linked as a supply', async () => {
      tx.payable.findUnique.mockResolvedValue(null);
      tx.supply.findUnique.mockResolvedValue(null);

      await service.registerReceived(event);

      expect(tx.payable.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ supply_id: undefined, monto_estimado: null }),
      });
    });

    it('is idempotent: a redelivered event creates nothing', async () => {
      tx.payable.findUnique.mockResolvedValue({ id: payableId });

      await expect(service.registerReceived(event)).resolves.toBe(false);
      expect(tx.payable.create).not.toHaveBeenCalled();
    });

    it('accrues in the next open period when the current one is closed', async () => {
      tx.payable.findUnique.mockResolvedValue(null);
      tx.supply.findUnique.mockResolvedValue(supply);
      tx.period.findMany.mockImplementation(({ where }) =>
        Promise.resolve(where.estado === StatusPeriod.CERRADO ? [{ periodo: where.periodo.gte }] : []),
      );

      await service.registerReceived(event);

      const [year, month] = periodOf(today(envs.businessTimezone)).split('-').map(Number);
      const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
      expect(tx.payable.create.mock.calls[0][0].data.periodo).toBe(next);
    });
  });

  describe('payPayable', () => {
    const payable = {
      id: payableId,
      organization_id,
      purchase_order_id: purchaseOrderId,
      producto_id: 8,
      supply_id: 10,
      cantidad: 1000,
      monto_estimado: 350_000,
      monto_real: null,
      estado: StatusPayable.POR_PAGAR,
      fecha_recepcion: new Date('2026-10-02'),
      periodo: '2026-10',
      pagada_en: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      tx.payable.findUnique.mockResolvedValue(payable);
      tx.supply.findUnique.mockResolvedValue(supply);
      tx.supply.update.mockImplementation(({ data }) => Promise.resolve({ ...supply, ...data }));
      tx.payable.findUniqueOrThrow.mockResolvedValue({ ...payable, estado: StatusPayable.PAGADA, monto_real: 380_000 });
    });

    it('records the expense in the category of the supply and in the period it was received', async () => {
      tx.payable.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.payPayable({ organization_id, id: payableId, monto_real: 380_000, cuenta: Account.BANCO, fecha: '2026-11-05' });

      expect(tx.movement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: TypeMovement.EGRESO,
          categoria: MovementCategory.EMPAQUES,
          monto: 380_000,
          periodo: '2026-10',
          cuenta: Account.BANCO,
          referencia_id: payableId,
        }),
      });
      expect(result).toMatchObject({ estado: StatusPayable.PAGADA, nombre: 'Vasos 12 oz' });
    });

    it('takes the bill as the new reference cost of the supply', async () => {
      tx.payable.updateMany.mockResolvedValue({ count: 1 });

      await service.payPayable({ organization_id, id: payableId, monto_real: 380_000, cuenta: Account.CAJA });

      expect(tx.supply.update).toHaveBeenCalledWith({ where: { id: 10, organization_id }, data: { costo_unitario: 380 } });
      expect(tx.supplyCost.create).toHaveBeenCalledWith({
        data: { organization_id, supply_id: 10, costo_unitario: 380, origen: `CUENTA_POR_PAGAR ${payableId}` },
      });
    });

    it('refuses to pay a bill twice', async () => {
      tx.payable.updateMany.mockResolvedValue({ count: 0 });

      const error = await service
        .payPayable({ organization_id, id: payableId, monto_real: 380_000, cuenta: Account.CAJA })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({ code: status.FAILED_PRECONDITION });
      expect(tx.movement.create).not.toHaveBeenCalled();
    });
  });
});
