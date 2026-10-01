import { MovementCategory } from '../generated/prisma/enums.ts';
import {
  accumulateConsumption,
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
  weightedUnitCost,
  type WaterfallInput,
} from './index.ts';

// Reference business of the plan: granizado at $5.000 with a variable cost of $2.000,
// fixed costs of $2.500.000 (rent 800k, utilities 200k, salaries 1.3M, others 200k),
// 26 operating days, a $600.000 installment and $8.000.000 invested
const PRECIO = 5000;
const CVU = 2000;
const COSTOS_FIJOS = 2_500_000;
const DIAS = 26;
const CUOTA = 600_000;
const INVERSION = 8_000_000;

describe('incomeStatement', () => {
  const variableCategories = [MovementCategory.MATERIA_PRIMA, MovementCategory.EMPAQUES, MovementCategory.TRANSPORTE];

  it('computes operating profit and available cash flow from the accrued categories', () => {
    const result = incomeStatement({
      variableCategories,
      cuotaCredito: CUOTA,
      totals: [
        { categoria: MovementCategory.VENTAS, monto: 6_500_000 },
        { categoria: MovementCategory.MATERIA_PRIMA, monto: 2_000_000 },
        { categoria: MovementCategory.EMPAQUES, monto: 600_000 },
        { categoria: MovementCategory.ARRIENDO, monto: 800_000 },
        { categoria: MovementCategory.SERVICIOS, monto: 200_000 },
        { categoria: MovementCategory.SALARIOS, monto: 1_300_000 },
        { categoria: MovementCategory.OTROS_OPERATIVOS, monto: 200_000 },
        // Payables of the same category add up
        { categoria: MovementCategory.MATERIA_PRIMA, monto: 0 },
      ],
    });

    expect(result).toMatchObject({
      ventas: 6_500_000,
      costos_variables: 2_600_000,
      margen_contribucion: 3_900_000,
      gastos_fijos: 2_500_000,
      utilidad_operativa: 1_400_000,
      cuota_credito: CUOTA,
      flujo_disponible: 800_000,
    });
    expect(result.detalle[0]).toEqual({ categoria: MovementCategory.VENTAS, monto: 6_500_000 });
  });

  it('never counts withdrawals, installments, contributions or reserve transfers as expenses', () => {
    const result = incomeStatement({
      variableCategories,
      cuotaCredito: 0,
      totals: [
        { categoria: MovementCategory.VENTAS, monto: 1_000_000 },
        { categoria: MovementCategory.RETIRO_PROPIETARIO, monto: 500_000 },
        { categoria: MovementCategory.CUOTA_CREDITO, monto: 600_000 },
        { categoria: MovementCategory.ABONO_EXTRAORDINARIO, monto: 300_000 },
        { categoria: MovementCategory.APORTE_PROPIETARIO, monto: 2_000_000 },
        { categoria: MovementCategory.TRASLADO_RESERVA, monto: 100_000 },
      ],
    });

    expect(result.utilidad_operativa).toBe(1_000_000);
    expect(result.detalle).toEqual([{ categoria: MovementCategory.VENTAS, monto: 1_000_000 }]);
  });

  it('moves a category between variable and fixed costs with the policy', () => {
    const totals = [{ categoria: MovementCategory.TRANSPORTE, monto: 100_000 }];

    expect(incomeStatement({ totals, variableCategories: [], cuotaCredito: 0 })).toMatchObject({
      costos_variables: 0,
      gastos_fijos: 100_000,
    });
  });
});

describe('breakEven', () => {
  it('computes units, money and daily units, with and without the credit installment', () => {
    expect(
      breakEven({ precio: PRECIO, cvu: CVU, costosFijos: COSTOS_FIJOS, diasOperacion: DIAS, cuotaAsignada: CUOTA }),
    ).toMatchObject({
      margen_contribucion_unitario: 3000,
      razon_contribucion: 0.6,
      alcanzable: true,
      pe_unidades: 834,
      pe_dinero: 4_166_667,
      pe_diario: 33,
      pe_credito_unidades: 1034,
      pe_credito_dinero: 5_166_667,
      pe_credito_diario: 40,
    });
  });

  it('does not round up an exact division', () => {
    expect(breakEven({ precio: 5000, cvu: 2500, costosFijos: 2_500_000, diasOperacion: 25, cuotaAsignada: 0 }))
      .toMatchObject({ pe_unidades: 1000, pe_diario: 40 });
  });

  it.each([2000, 2500])('is unreachable when the price (%d) does not cover the variable cost', (precio) => {
    const result = breakEven({ precio, cvu: 2500, costosFijos: COSTOS_FIJOS, diasOperacion: DIAS, cuotaAsignada: 0 });

    expect(result).toMatchObject({ alcanzable: false, mensaje: expect.stringContaining('inalcanzable') });
    expect(result).not.toHaveProperty('pe_unidades');
  });
});

describe('scenarios', () => {
  const run = (niveles: number[], faltanteReserva = 0) =>
    scenarios({
      niveles,
      precio: PRECIO,
      cvu: CVU,
      costosFijos: COSTOS_FIJOS,
      diasOperacion: DIAS,
      cuotaAsignada: CUOTA,
      faltanteReserva,
      inversionInicial: INVERSION,
      insumos: [{ producto_id: 7, nombre: 'Hielo (bolsa)', cantidad_por_unidad: 0.05, costo_unitario: 6000 }],
    });

  it('projects sales, costs, profit, cash flow and payback for each daily level', () => {
    const [treinta, cincuenta, cien] = run([30, 50, 100]);

    expect(treinta).toMatchObject({
      unidades_mes: 780,
      ventas: 3_900_000,
      costos_variables: 1_560_000,
      utilidad_operativa: -160_000,
      flujo_disponible: -760_000,
      meses_recuperacion: undefined,
      resultado: 'PERDIDA',
    });
    expect(cincuenta).toMatchObject({
      ventas: 6_500_000,
      costos_variables: 2_600_000,
      utilidad_operativa: 1_400_000,
      flujo_disponible: 800_000,
      meses_recuperacion: 10,
      resultado: 'GANANCIA',
    });
    expect(cien).toMatchObject({
      ventas: 13_000_000,
      costos_variables: 5_200_000,
      utilidad_operativa: 5_300_000,
      flujo_disponible: 4_700_000,
      meses_recuperacion: 1.7,
    });
  });

  it('flags a level that covers the operation but not the installment', () => {
    // 36/day: 936 units, 4.68M sales, 1.872M variable costs → profit 308k, flow −292k
    expect(run([36])[0]).toMatchObject({ utilidad_operativa: 308_000, flujo_disponible: -292_000, resultado: 'CUBRE_OPERACION' });
  });

  it('fills the reserve before estimating the distributable profit', () => {
    expect(run([50], 500_000)[0]).toMatchObject({ aporte_reserva: 500_000, distribuible_estimado: 300_000 });
    expect(run([30], 500_000)[0]).toMatchObject({ aporte_reserva: 0, distribuible_estimado: 0 });
  });

  it('shows the monthly consumption of each supply in products-ms units', () => {
    // 1300 granizados × 0.05 bags = 65 bags × $6.000
    expect(run([50])[0].insumos).toEqual([
      { producto_id: 7, nombre: 'Hielo (bolsa)', cantidad_mensual: 65, costo_mensual: 390_000 },
    ]);
  });
});

describe('replenishment', () => {
  it('values what is missing to cover the coverage days plus the minimum stock', () => {
    const result = replenishment(
      [
        // 50 granizados/day × 0.05 bags: 2.5/day → 7 days 17.5 + 5 minimum = 22.5 − 10 in stock − 5 ordered
        { producto_id: 7, nombre: 'Hielo', costo_unitario: 6000, consumo_diario: 2.5, stock_actual: 10, stock_minimo: 5, en_ordenes_abiertas: 5 },
        // Enough stock: nothing to buy
        { producto_id: 8, nombre: 'Vasos', costo_unitario: 350, consumo_diario: 50, stock_actual: 1000, stock_minimo: 100, en_ordenes_abiertas: 0 },
      ],
      7,
    );

    expect(result.items[0]).toMatchObject({ necesidad: 22.5, faltante: 8, valor: 48_000, compromiso: 30_000 });
    expect(result.items[1]).toMatchObject({ faltante: 0, valor: 0 });
    expect(result).toMatchObject({ reposicion: 48_000, compromisos: 30_000 });
  });

  it('estimates by formula when the stock is not available', () => {
    expect(estimatedReplenishment(7, 50, 2000)).toBe(700_000);
  });
});

describe('waterfall', () => {
  const input: WaterfallInput = {
    efectivoCaja: 1_000_000,
    efectivoBanco: 2_000_000,
    cuentasPorPagar: 250_000,
    gastosPendientes: 150_000,
    compromisosCompra: 0,
    reposicionInventario: 700_000,
    cuotaPendiente: 600_000,
    reservaMeta: 2_500_000,
    reservaAcumulada: 2_000_000,
    utilidadesNoDistribuidas: 5_000_000,
    porcentajeRetiro: 50,
  };

  it('covers pending costs, replenishment, obligations and reserve before the surplus', () => {
    expect(waterfall(input)).toMatchObject({
      efectivo_operativo: 3_000_000,
      pendientes: 400_000,
      capital_trabajo: 1_700_000,
      faltante_reserva: 500_000,
      excedente: 800_000,
      deficit: 0,
      utilidad_distribuible: 800_000,
      // The reserve is below its goal: no prepayments yet
      abono_permitido: false,
      disponible_abono: 0,
      sugerido_retiro: 400_000,
      sugerido_abono: 0,
    });
  });

  it('allows prepayments once the working capital and the reserve are covered', () => {
    expect(waterfall({ ...input, reservaAcumulada: 2_500_000 })).toMatchObject({
      excedente: 1_300_000,
      abono_permitido: true,
      disponible_abono: 1_300_000,
      sugerido_retiro: 650_000,
      sugerido_abono: 650_000,
    });
  });

  it('never distributes contributed capital as profit', () => {
    expect(waterfall({ ...input, utilidadesNoDistribuidas: 300_000 }).utilidad_distribuible).toBe(300_000);
    expect(waterfall({ ...input, utilidadesNoDistribuidas: -100_000 }).utilidad_distribuible).toBe(0);
  });

  it('reports the deficit when the cash does not cover the working capital and the reserve', () => {
    expect(waterfall({ ...input, efectivoBanco: 0 })).toMatchObject({ excedente: 0, deficit: 1_200_000, utilidad_distribuible: 0 });
  });
});

describe('evaluateWithdrawal', () => {
  const cascada = { utilidad_distribuible: 800_000 };
  const options = { forzar: false, inventarioEstimado: false };

  it('accepts a withdrawal up to the distributable profit', () => {
    expect(evaluateWithdrawal(800_000, cascada, options)).toEqual({ allowed: true, descapitalizacion: false });
  });

  it('rejects a withdrawal above it unless it is forced with a reason', () => {
    expect(evaluateWithdrawal(900_000, cascada, options)).toMatchObject({ allowed: false });
    expect(evaluateWithdrawal(900_000, cascada, { ...options, forzar: true })).toMatchObject({ allowed: false });
    expect(evaluateWithdrawal(900_000, cascada, { ...options, forzar: true, motivo: 'Gasto familiar urgente' }))
      .toEqual({ allowed: true, descapitalizacion: true });
  });

  it('does not let a withdrawal be forced while the inventory is an estimate', () => {
    expect(
      evaluateWithdrawal(900_000, cascada, { forzar: true, motivo: 'x', inventarioEstimado: true }),
    ).toMatchObject({ allowed: false });
  });
});

describe('evaluatePrepayment', () => {
  it('rejects a prepayment while the reserve is below its goal, without override', () => {
    const result = evaluatePrepayment(100_000, { abono_permitido: false, disponible_abono: 0, faltante_reserva: 500_000, deficit: 0 });

    expect(result).toMatchObject({ allowed: false });
    expect((result as { reason: string }).reason).toContain('reserva');
  });

  it('accepts a prepayment up to the available surplus', () => {
    const cascada = { abono_permitido: true, disponible_abono: 1_300_000, faltante_reserva: 0, deficit: 0 };

    expect(evaluatePrepayment(1_300_000, cascada)).toEqual({ allowed: true });
    expect(evaluatePrepayment(1_300_001, cascada)).toMatchObject({ allowed: false });
  });
});

describe('recovery', () => {
  it('measures the recovered share of the investment and the months left', () => {
    expect(recovery(INVERSION, [800_000, 800_000, 800_000])).toEqual({
      inversion_inicial: INVERSION,
      recuperado: 2_400_000,
      porcentaje: 30,
      meses_restantes: 7,
    });
  });

  it('cannot estimate the months left without a positive recent cash flow', () => {
    expect(recovery(INVERSION, [100_000, -300_000, -200_000]).meses_restantes).toBeUndefined();
  });

  it('is complete once the flows cover the investment', () => {
    expect(recovery(1_000_000, [800_000, 800_000])).toMatchObject({ porcentaje: 100, meses_restantes: 0 });
  });
});

describe('accumulateConsumption', () => {
  it('discounts one bag of ice every 20 granizados and keeps the fraction', () => {
    let pendiente = 0;
    const descontado: number[] = [];
    for (let i = 0; i < 20; i++) {
      const result = accumulateConsumption(pendiente, 0.05);
      pendiente = result.pendiente;
      descontado.push(result.descontar);
    }

    expect(descontado.slice(0, 19).every((units) => units === 0)).toBe(true);
    expect(descontado[19]).toBe(1);
    expect(pendiente).toBe(0);
  });

  it('discounts the whole units of a big sale at once', () => {
    expect(accumulateConsumption(0.3, 2.75)).toEqual({ descontar: 3, pendiente: 0.05 });
  });
});

describe('recipe costs', () => {
  it('adds the quantity × cost of every supply of the recipe', () => {
    // syrup $900 + ice $300 + cup $350 + lid $150 + straw $50 + fruit $250
    expect(
      recipeUnitCost([
        { cantidad: 60, costo_unitario: 15 },
        { cantidad: 0.05, costo_unitario: 6000 },
        { cantidad: 1, costo_unitario: 350 },
        { cantidad: 1, costo_unitario: 150 },
        { cantidad: 1, costo_unitario: 50 },
        { cantidad: 0.1, costo_unitario: 2500 },
      ]),
    ).toBe(2000);
  });

  it('weights the variable unit cost by the units sold', () => {
    expect(weightedUnitCost([{ unidades: 30, costo_unitario: 2000 }, { unidades: 10, costo_unitario: 2800 }])).toBe(2200);
    expect(weightedUnitCost([])).toBeUndefined();
  });
});
