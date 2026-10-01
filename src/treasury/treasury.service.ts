import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import { Prisma, type Assumptions } from '../generated/prisma/client.ts';
import {
  Account,
  MovementCategory,
  StatusMovement,
  StatusPayable,
  StatusPeriod,
  StatusStockDeduction,
  TypeMovement,
} from '../generated/prisma/enums.ts';
import { envs } from '../config/envs.ts';
import {
  addDays,
  assertOpenPeriod,
  failedPrecondition,
  notFound,
  periodOf,
  toDbDate,
  today,
} from '../common/index.ts';
import {
  breakEven,
  estimatedReplenishment,
  evaluatePrepayment,
  evaluateWithdrawal,
  incomeStatement,
  recipeUnitCost,
  recovery,
  replenishment,
  scenarios,
  waterfall,
  type BreakEvenResult,
  type WaterfallResult,
} from '../calculations/index.ts';
import { InventoryClient, PurchasingClient, type StockLevel } from '../integrations/index.ts';
import { accountBalances, assertBalance, lockTreasury, type Balances } from '../ledger/balances.ts';
import { toMovementResponse } from '../ledger/movement.response.ts';
import { fixedCostsOf, loadAssumptions, loadPolicy, type PolicyValues } from '../planning/planning.queries.ts';
import { installmentStatus, paidInstallments, toCreditResponse } from '../credits/credit.queries.ts';
import type { PrepayCreditDto } from '../credits/dto/index.ts';
import {
  accruedTotals,
  accruedTotalsByPeriod,
  pendingExpenses,
  salesStats,
  sumMovements,
  type SalesStats,
} from './treasury.queries.ts';
import type { PeriodDto, RegisterWithdrawalDto, ReopenPeriodDto, ScenariosDto } from './dto/index.ts';

type Tx = Prisma.TransactionClient;

// Stock (products-ms) and open purchase orders (orders-ms) of the supplies. Read before the
// transaction; estimated=true when one of them did not answer
interface InventoryReading {
  stock: Map<number, StockLevel>;
  orders: Map<number, number>;
  estimated: boolean;
}

// Days of sales used for the averages (consumption, units per day, variable unit cost)
const SALES_WINDOW_DAYS = 30;

type BreakEvenReport = BreakEvenResult & { cvu_origen: string };

@Injectable()
export class TreasuryService {
  private readonly logger = new Logger(TreasuryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryClient,
    private readonly purchasing: PurchasingClient,
  ) { }

  // ------------------------------------------------------------------ reports

  async getIncomeStatement({ organization_id, periodo }: PeriodDto) {
    const target = periodo ?? periodOf(this.today());
    return this.prisma.withTenant(organization_id, async (tx) => {
      const period = await tx.period.findUnique({
        where: { organization_id_periodo: { organization_id, periodo: target } },
      });
      // A closed period answers with the figures it had when it was closed
      const resumen = period?.estado === StatusPeriod.CERRADO ? (period.resumen as { estado_resultados?: object } | null) : null;
      if (resumen?.estado_resultados) return resumen.estado_resultados;

      return this.incomeStatementOf(tx, organization_id, target, await loadPolicy(tx, organization_id));
    });
  }

  async getWaterfall(organization_id: string) {
    const reading = await this.readInventory(organization_id);
    return this.prisma.withTenant(organization_id, async (tx) => (await this.cascade(tx, organization_id, reading)).cascada);
  }

  async getBreakEven(organization_id: string) {
    return this.prisma.withTenant(organization_id, async (tx) => {
      const report = await this.breakEvenOf(tx, organization_id);
      if ('error' in report) throw failedPrecondition(report.error);
      return report.result;
    });
  }

  async getScenarios({ organization_id, niveles }: ScenariosDto) {
    return this.prisma.withTenant(organization_id, async (tx) => {
      const report = await this.breakEvenOf(tx, organization_id);
      if ('error' in report) throw failedPrecondition(report.error);
      const { result, assumptions, stats } = report;

      const policy = await loadPolicy(tx, organization_id);
      const balances = await accountBalances(tx, organization_id);
      const reservaMeta = Math.round(policy.meses_reserva * fixedCostsOf(assumptions));

      return {
        data: scenarios({
          niveles: niveles?.length ? niveles : policy.niveles_escenario,
          precio: assumptions.precio_promedio,
          cvu: result.costo_variable_unitario,
          costosFijos: result.costos_fijos,
          diasOperacion: assumptions.dias_operacion,
          cuotaAsignada: result.cuota_asignada,
          faltanteReserva: Math.max(0, reservaMeta - balances[Account.RESERVA]),
          inversionInicial: assumptions.inversion_inicial,
          insumos: await this.supplyRates(tx, organization_id, stats),
        }),
        punto_equilibrio: result,
      };
    });
  }

  // Everything the owner needs to answer the five questions, in one call
  async getDashboard(organization_id: string) {
    const reading = await this.readInventory(organization_id);
    const date = this.today();
    const periodo = periodOf(date);

    return this.prisma.withTenant(organization_id, async (tx) => {
      const policy = await loadPolicy(tx, organization_id);
      const estado_resultados = await this.incomeStatementOf(tx, organization_id, periodo, policy);
      const breakEvenReport = await this.breakEvenOf(tx, organization_id);
      const punto_equilibrio = 'error' in breakEvenReport ? undefined : breakEvenReport.result;
      const { cascada, assumptions } = await this.cascade(tx, organization_id, reading);

      const flows = (await accruedTotalsByPeriod(tx, organization_id)).map(
        ([, { totals, cuotasPagadas }]) =>
          incomeStatement({ totals, variableCategories: policy.categorias_variables, cuotaCredito: cuotasPagadas })
            .flujo_disponible,
      );
      const inversion_inicial = assumptions?.inversion_inicial ?? 0;

      return {
        periodo,
        estado_resultados,
        punto_equilibrio,
        cascada,
        recuperacion: recovery(inversion_inicial, flows),
        respuestas: {
          vender_por_dia: punto_equilibrio?.alcanzable ? punto_equilibrio.pe_diario : undefined,
          vender_por_dia_con_credito: punto_equilibrio?.alcanzable ? punto_equilibrio.pe_credito_diario : undefined,
          utilidad_operativa: estado_resultados.utilidad_operativa,
          flujo_disponible: estado_resultados.flujo_disponible,
          dejar_en_el_negocio: cascada.capital_trabajo + cascada.reserva_meta,
          retiro_maximo: cascada.utilidad_distribuible,
          abono_maximo: cascada.disponible_abono,
        },
        alertas: await this.alerts(tx, organization_id, periodo, {
          breakEvenReport,
          cascada,
          inventarioEstimado: reading.estimated,
        }),
        inversion_inicial,
      };
    });
  }

  // ------------------------------------------------------------------ money decisions

  // Owner withdrawal, evaluated against the waterfall. The treasury lock serializes the
  // withdrawals and prepayments of the organization, so two of them cannot spend the same
  // surplus
  async registerWithdrawal({ organization_id, monto, cuenta, fecha, descripcion, forzar, motivo }: RegisterWithdrawalDto) {
    const date = fecha ?? this.today();
    const periodo = periodOf(date);
    const reading = await this.readInventory(organization_id);

    const movement = await this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);
      await lockTreasury(tx, organization_id);

      const { cascada } = await this.cascade(tx, organization_id, reading);
      const decision = evaluateWithdrawal(monto, cascada, {
        forzar: forzar === true,
        motivo,
        inventarioEstimado: reading.estimated,
      });
      if (!decision.allowed) throw failedPrecondition(decision.reason);
      await assertBalance(tx, organization_id, cuenta, monto);

      return tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.EGRESO,
          categoria: MovementCategory.RETIRO_PROPIETARIO,
          monto,
          periodo,
          fecha: toDbDate(date),
          estado: StatusMovement.PAGADO,
          cuenta,
          pagado_en: toDbDate(date),
          descapitalizacion: decision.descapitalizacion,
          descripcion: [descripcion, decision.descapitalizacion && `Descapitalización: ${motivo}`]
            .filter(Boolean)
            .join(' · ') || null,
        },
      });
    });

    if (movement.descapitalizacion) {
      this.logger.warn(`Organization ${organization_id}: forced withdrawal of ${monto} above the distributable profit`);
    }
    return toMovementResponse(movement);
  }

  // Extraordinary payment to the principal: only with the working capital covered and the
  // reserve complete, up to the surplus
  async prepayCredit({ organization_id, id, cuenta, monto, fecha }: PrepayCreditDto) {
    const date = fecha ?? this.today();
    const periodo = periodOf(date);
    const reading = await this.readInventory(organization_id);

    return this.prisma.withTenant(organization_id, async (tx) => {
      await assertOpenPeriod(tx, organization_id, periodo);
      await lockTreasury(tx, organization_id);

      const credit = await tx.credit.findUnique({ where: { id, organization_id } });
      if (!credit) throw notFound(`Credit with id: #${id} not found`);
      if (!credit.activo) throw failedPrecondition(`Credit #${id} is already paid off`);
      if (monto > credit.saldo_capital) {
        throw failedPrecondition(`The prepayment (${monto}) is greater than the principal (${credit.saldo_capital})`);
      }

      const { cascada } = await this.cascade(tx, organization_id, reading);
      const decision = evaluatePrepayment(monto, cascada);
      if (!decision.allowed) throw failedPrecondition(decision.reason);
      await assertBalance(tx, organization_id, cuenta, monto);

      await tx.movement.create({
        data: {
          organization_id,
          tipo: TypeMovement.EGRESO,
          categoria: MovementCategory.ABONO_EXTRAORDINARIO,
          monto,
          periodo,
          fecha: toDbDate(date),
          estado: StatusMovement.PAGADO,
          cuenta,
          pagado_en: toDbDate(date),
          descripcion: `Abono extraordinario ${credit.nombre}`,
          referencia_id: credit.id,
        },
      });

      const saldo_capital = credit.saldo_capital - monto;
      const updated = await tx.credit.update({
        where: { id, organization_id },
        data: { saldo_capital, activo: saldo_capital > 0 },
      });
      return toCreditResponse(updated, await paidInstallments(tx, organization_id, updated, periodOf(this.today())));
    });
  }

  // ------------------------------------------------------------------ periods

  // Freezes the income statement, the break-even and the waterfall of the period. A sale
  // whose stock discount was rejected must be fixed first (inventory out of sync)
  async closePeriod({ organization_id, periodo }: PeriodDto) {
    const current = periodOf(this.today());
    const target = periodo ?? current;
    if (target > current) throw failedPrecondition(`The period ${target} has not started yet`);
    const reading = await this.readInventory(organization_id);

    const period = await this.prisma.withTenant(organization_id, async (tx) => {
      await lockTreasury(tx, organization_id);

      const existing = await tx.period.findUnique({
        where: { organization_id_periodo: { organization_id, periodo: target } },
      });
      if (existing?.estado === StatusPeriod.CERRADO) throw failedPrecondition(`The period ${target} is already closed`);

      const rejected = await tx.sale.count({
        where: { organization_id, periodo: target, estado_stock: StatusStockDeduction.STOCK_RECHAZADO },
      });
      if (rejected) {
        throw failedPrecondition(
          `${rejected} sale(s) of ${target} could not discount their supplies from the stock: fix the stock in products-ms and retry them first`,
        );
      }

      const policy = await loadPolicy(tx, organization_id);
      const estado_resultados = await this.incomeStatementOf(tx, organization_id, target, policy);
      const breakEvenReport = await this.breakEvenOf(tx, organization_id);
      const { cascada } = await this.cascade(tx, organization_id, reading);

      const resumen = {
        estado_resultados: { ...estado_resultados, cerrado: true },
        punto_equilibrio: 'error' in breakEvenReport ? null : breakEvenReport.result,
        cascada,
      } as unknown as Prisma.InputJsonValue;

      return tx.period.upsert({
        where: { organization_id_periodo: { organization_id, periodo: target } },
        create: { organization_id, periodo: target, estado: StatusPeriod.CERRADO, resumen, cerrado_en: new Date() },
        update: { estado: StatusPeriod.CERRADO, resumen, cerrado_en: new Date(), reabierto_motivo: null },
      });
    });

    this.logger.log(`Organization ${organization_id}: period ${target} closed`);
    return this.toPeriodResponse(period);
  }

  async reopenPeriod({ organization_id, periodo, motivo }: ReopenPeriodDto) {
    const period = await this.prisma.withTenant(organization_id, async (tx) => {
      const { count } = await tx.period.updateMany({
        where: { organization_id, periodo, estado: StatusPeriod.CERRADO },
        data: { estado: StatusPeriod.ABIERTO, resumen: Prisma.DbNull, reabierto_motivo: motivo },
      });
      if (count === 0) throw failedPrecondition(`The period ${periodo} is not closed`);
      return tx.period.findUniqueOrThrow({ where: { organization_id_periodo: { organization_id, periodo } } });
    });

    this.logger.warn(`Organization ${organization_id}: period ${periodo} reopened: ${motivo}`);
    return this.toPeriodResponse(period);
  }

  // ------------------------------------------------------------------ building blocks

  private today() {
    return today(envs.businessTimezone);
  }

  private async readInventory(organization_id: string): Promise<InventoryReading> {
    const supplies = await this.prisma.withTenant(organization_id, (tx) =>
      tx.supply.findMany({ where: { organization_id }, select: { producto_id: true } }),
    );
    if (!supplies.length) return { stock: new Map(), orders: new Map(), estimated: false };

    try {
      const [stock, orders] = await Promise.all([
        this.inventory.findStock(organization_id, supplies.map((supply) => supply.producto_id)),
        this.purchasing.openOrderQuantities(organization_id),
      ]);
      return { stock, orders, estimated: false };
    } catch (error) {
      this.logger.warn(
        `Organization ${organization_id}: inventory not available, replenishment estimated: ${(error as Error)?.message ?? error}`,
      );
      return { stock: new Map(), orders: new Map(), estimated: true };
    }
  }

  private async salesWindow(tx: Tx, organization_id: string) {
    const date = this.today();
    return salesStats(tx, organization_id, toDbDate(addDays(date, 1 - SALES_WINDOW_DAYS)), toDbDate(date));
  }

  // Current waterfall: cash, pending costs, replenishment with the real stock and open
  // orders, installment, reserve and the surplus left for withdrawals and prepayments
  private async cascade(tx: Tx, organization_id: string, reading: InventoryReading) {
    const date = this.today();
    const periodo = periodOf(date);

    const policy = await loadPolicy(tx, organization_id);
    const assumptions = await loadAssumptions(tx, organization_id, date);
    const balances = await accountBalances(tx, organization_id);
    const diasOperacion = assumptions?.dias_operacion ?? SALES_WINDOW_DAYS;
    const stats = await this.salesWindow(tx, organization_id);

    let reposicion: number;
    let compromisos = 0;
    let reposicion_detalle: object[] = [];
    if (reading.estimated) {
      const cvu = stats.cvu ?? assumptions?.costo_variable_unitario ?? 0;
      reposicion = estimatedReplenishment(policy.dias_cobertura, stats.unidades / diasOperacion, cvu);
    } else {
      const supplies = await tx.supply.findMany({ where: { organization_id }, orderBy: { nombre: 'asc' } });
      const result = replenishment(
        supplies.map((supply) => ({
          producto_id: supply.producto_id,
          nombre: supply.nombre,
          costo_unitario: Number(supply.costo_unitario),
          consumo_diario: (stats.consumption.get(supply.id) ?? 0) / diasOperacion,
          // An inactive product is not listed by products-ms: no stock left to count on
          stock_actual: reading.stock.get(supply.producto_id)?.stock_actual ?? 0,
          stock_minimo: reading.stock.get(supply.producto_id)?.stock_minimo ?? 0,
          en_ordenes_abiertas: reading.orders.get(supply.producto_id) ?? 0,
        })),
        policy.dias_cobertura,
      );
      reposicion = result.reposicion;
      compromisos = result.compromisos;
      reposicion_detalle = result.items.map(({ compromiso: _compromiso, costo_unitario: _costo, ...item }) => item);
    }

    const accrued = await accruedTotals(tx, organization_id);
    const installments = await installmentStatus(tx, organization_id, periodo);
    const utilidadAcumulada = incomeStatement({
      totals: accrued.totals,
      variableCategories: policy.categorias_variables,
      cuotaCredito: 0,
    }).utilidad_operativa;
    const cuotasPagadas = await sumMovements(tx, {
      organization_id,
      categoria: MovementCategory.CUOTA_CREDITO,
      estado: StatusMovement.PAGADO,
    });
    const retiros = await sumMovements(tx, { organization_id, categoria: MovementCategory.RETIRO_PROPIETARIO });

    const cascada = waterfall({
      efectivoCaja: balances[Account.CAJA],
      efectivoBanco: balances[Account.BANCO],
      cuentasPorPagar: accrued.cuentasPorPagar,
      gastosPendientes: await pendingExpenses(tx, organization_id),
      compromisosCompra: compromisos,
      reposicionInventario: reposicion,
      cuotaPendiente: installments.cuotaPendiente,
      reservaMeta: Math.round(policy.meses_reserva * (await this.monthlyFixedCosts(tx, organization_id, assumptions, policy))),
      reservaAcumulada: balances[Account.RESERVA],
      utilidadesNoDistribuidas: utilidadAcumulada - cuotasPagadas - retiros,
      porcentajeRetiro: policy.porcentaje_retiro,
    });

    return {
      cascada: { ...cascada, inventario_estimado: reading.estimated, reposicion_detalle } as WaterfallResult & {
        inventario_estimado: boolean;
        reposicion_detalle: object[];
      },
      assumptions,
      balances: balances as Balances,
    };
  }

  // Fixed costs of the assumptions; without them, those accrued in the previous period
  private async monthlyFixedCosts(tx: Tx, organization_id: string, assumptions: Assumptions | null, policy: PolicyValues) {
    if (assumptions) return fixedCostsOf(assumptions);
    const previous = periodOf(addDays(`${periodOf(this.today())}-01`, -1));
    const { totals } = await accruedTotals(tx, organization_id, previous);
    return incomeStatement({ totals, variableCategories: policy.categorias_variables, cuotaCredito: 0 }).gastos_fijos;
  }

  private async incomeStatementOf(tx: Tx, organization_id: string, periodo: string, policy: PolicyValues) {
    const accrued = await accruedTotals(tx, organization_id, periodo);
    const { cuotaAsignada } = await installmentStatus(tx, organization_id, periodo);
    const sales = await tx.sale.aggregate({ where: { organization_id, periodo }, _sum: { costo_total: true } });
    const units = await tx.saleLine.aggregate({ where: { organization_id, sale: { periodo } }, _sum: { unidades: true } });

    return {
      periodo,
      cerrado: false,
      ...incomeStatement({
        totals: accrued.totals,
        variableCategories: policy.categorias_variables,
        cuotaCredito: cuotaAsignada,
      }),
      costo_de_lo_vendido: sales._sum.costo_total ?? 0,
      unidades_vendidas: units._sum.unidades ?? 0,
      cuentas_sin_valorar: accrued.sinValorar,
    };
  }

  // Break-even with the assumptions in force. The variable unit cost is the manual one or,
  // without it, the recipes weighted by the units sold in the last 30 days (or their plain
  // average when nothing was sold yet)
  private async breakEvenOf(
    tx: Tx,
    organization_id: string,
  ): Promise<{ error: string } | { result: BreakEvenReport; assumptions: Assumptions; stats: SalesStats }> {
    const date = this.today();
    const assumptions = await loadAssumptions(tx, organization_id, date);
    if (!assumptions) return { error: 'Register the break-even assumptions first' };

    const stats = await this.salesWindow(tx, organization_id);
    let cvu: number | undefined;
    let cvu_origen = 'RECETAS';
    if (assumptions.costo_variable_unitario !== null) {
      cvu = assumptions.costo_variable_unitario;
      cvu_origen = 'MANUAL';
    } else {
      cvu = stats.cvu ?? (await this.averageRecipeCost(tx, organization_id));
    }
    if (cvu === undefined) {
      return { error: 'Register the recipes or a manual costo_variable_unitario in the assumptions' };
    }

    const { cuotaAsignada } = await installmentStatus(tx, organization_id, periodOf(date));
    const result = breakEven({
      precio: assumptions.precio_promedio,
      cvu,
      costosFijos: fixedCostsOf(assumptions),
      diasOperacion: assumptions.dias_operacion,
      cuotaAsignada,
    });
    return { result: { ...result, cvu_origen }, assumptions, stats };
  }

  private async averageRecipeCost(tx: Tx, organization_id: string) {
    const recipes = await tx.recipe.findMany({
      where: { organization_id, activo: true },
      include: { items: { include: { supply: { select: { costo_unitario: true } } } } },
    });
    if (!recipes.length) return undefined;
    const costs = recipes.map((recipe) =>
      recipeUnitCost(
        recipe.items.map((item) => ({ cantidad: Number(item.cantidad), costo_unitario: Number(item.supply.costo_unitario) })),
      ),
    );
    return costs.reduce((total, cost) => total + cost, 0) / costs.length;
  }

  // Average consumption of each supply per unit sold: the sales mix of the last 30 days, or
  // the plain average of the active recipes when nothing was sold yet
  private async supplyRates(tx: Tx, organization_id: string, stats: SalesStats) {
    const supplies = await tx.supply.findMany({ where: { organization_id }, orderBy: { nombre: 'asc' } });
    let perUnit = new Map<number, number>();

    if (stats.unidades > 0) {
      for (const [supplyId, consumo] of stats.consumption) perUnit.set(supplyId, consumo / stats.unidades);
    } else {
      const recipes = await tx.recipe.findMany({ where: { organization_id, activo: true }, include: { items: true } });
      for (const recipe of recipes) {
        for (const item of recipe.items) {
          perUnit.set(item.supply_id, (perUnit.get(item.supply_id) ?? 0) + Number(item.cantidad) / recipes.length);
        }
      }
    }

    return supplies
      .filter((supply) => perUnit.has(supply.id))
      .map((supply) => ({
        producto_id: supply.producto_id,
        nombre: supply.nombre,
        cantidad_por_unidad: perUnit.get(supply.id)!,
        costo_unitario: Number(supply.costo_unitario),
      }));
  }

  private async alerts(
    tx: Tx,
    organization_id: string,
    periodo: string,
    context: {
      breakEvenReport: Awaited<ReturnType<TreasuryService['breakEvenOf']>>;
      cascada: WaterfallResult;
      inventarioEstimado: boolean;
    },
  ) {
    const alertas: { codigo: string; mensaje: string }[] = [];
    const { breakEvenReport, cascada } = context;

    if ('error' in breakEvenReport) {
      alertas.push({ codigo: 'SIN_SUPUESTOS', mensaje: breakEvenReport.error });
    } else if (!breakEvenReport.result.alcanzable) {
      alertas.push({ codigo: 'EQUILIBRIO_INALCANZABLE', mensaje: breakEvenReport.result.mensaje! });
    } else {
      // Average units per day with sales in the period against the daily break-even
      const days = await tx.sale.groupBy({ by: ['fecha'], where: { organization_id, periodo } });
      const units = await tx.saleLine.aggregate({ where: { organization_id, sale: { periodo } }, _sum: { unidades: true } });
      const promedio = days.length ? (units._sum.unidades ?? 0) / days.length : 0;
      if (days.length && promedio < breakEvenReport.result.pe_diario!) {
        alertas.push({
          codigo: 'VENTAS_BAJO_EQUILIBRIO',
          mensaje: `Se venden ${Math.round(promedio)} granizados por día y el punto de equilibrio es ${breakEvenReport.result.pe_diario}`,
        });
      }
    }

    if (cascada.deficit > 0) {
      alertas.push({
        codigo: 'CAPITAL_DE_TRABAJO_INSUFICIENTE',
        mensaje: `Faltan ${cascada.deficit} para cubrir el capital de trabajo y la reserva`,
      });
    }
    if (cascada.faltante_reserva > 0) {
      alertas.push({
        codigo: 'RESERVA_BAJO_META',
        mensaje: `La reserva está ${cascada.faltante_reserva} por debajo de la meta: traslada ese valor a RESERVA`,
      });
    }

    const descapitalizaciones = await tx.movement.count({
      where: { organization_id, periodo, categoria: MovementCategory.RETIRO_PROPIETARIO, descapitalizacion: true },
    });
    if (descapitalizaciones) {
      alertas.push({
        codigo: 'DESCAPITALIZACION',
        mensaje: `${descapitalizaciones} retiro(s) del período superaron la utilidad distribuible`,
      });
    }

    const rechazadas = await tx.sale.count({
      where: { organization_id, estado_stock: StatusStockDeduction.STOCK_RECHAZADO },
    });
    if (rechazadas) {
      alertas.push({
        codigo: 'INVENTARIO_DESINCRONIZADO',
        mensaje: `${rechazadas} venta(s) no pudieron descontar sus insumos del stock de products-ms`,
      });
    }

    const sinValorar = await tx.payable.count({
      where: { organization_id, estado: StatusPayable.POR_PAGAR, monto_estimado: null },
    });
    if (sinValorar) {
      alertas.push({
        codigo: 'CUENTAS_SIN_VALORAR',
        mensaje: `${sinValorar} cuenta(s) por pagar no tienen costo de referencia: vincula el insumo con su costo`,
      });
    }

    if (context.inventarioEstimado) {
      alertas.push({
        codigo: 'INVENTARIO_ESTIMADO',
        mensaje: 'products-ms u orders-ms no respondieron: la reposición se estimó con las ventas promedio',
      });
    }

    return alertas;
  }

  private toPeriodResponse(period: { periodo: string; estado: StatusPeriod; cerrado_en: Date | null; reabierto_motivo: string | null }) {
    return {
      periodo: period.periodo,
      estado: period.estado,
      cerrado_en: period.cerrado_en?.toISOString(),
      reabierto_motivo: period.reabierto_motivo ?? undefined,
    };
  }
}
