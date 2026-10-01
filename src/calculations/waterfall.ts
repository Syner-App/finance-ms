export interface WaterfallInput {
  efectivoCaja: number;
  efectivoBanco: number;
  // 1. Pending: received purchase orders not paid, accrued expenses not paid and open
  // purchase orders (valued at the reference cost)
  cuentasPorPagar: number;
  gastosPendientes: number;
  compromisosCompra: number;
  // 2. Money to buy back the supplies the next days will consume
  reposicionInventario: number;
  // 3. Credit installment of the period not paid yet
  cuotaPendiente: number;
  // 4. Reserve: goal (months of fixed costs) and what is already set aside (RESERVA account)
  reservaMeta: number;
  reservaAcumulada: number;
  // Accrued operating profit − installments paid − withdrawals, since the beginning
  utilidadesNoDistribuidas: number;
  // Suggested share of the surplus for withdrawals (0-100); the rest, for prepayments
  porcentajeRetiro: number;
}

// Cash in the till or the bank is not the owners' money. Before any withdrawal it covers,
// in this order: pending costs, inventory replenishment, financial obligations and the
// reserve. Only what is left (the surplus) can be withdrawn or prepaid to the credit.
// Every withdrawal or prepayment lowers the cash, so the next evaluation already reflects it
export function waterfall(input: WaterfallInput) {
  const efectivo_operativo = input.efectivoCaja + input.efectivoBanco;
  const pendientes = input.cuentasPorPagar + input.gastosPendientes + input.compromisosCompra;
  const capital_trabajo = pendientes + input.reposicionInventario + input.cuotaPendiente;
  const faltante_reserva = Math.max(0, input.reservaMeta - input.reservaAcumulada);

  const saldo = efectivo_operativo - capital_trabajo - faltante_reserva;
  const excedente = Math.max(0, saldo);

  // Profit can be distributed; capital contributed by the owners cannot
  const utilidad_distribuible = Math.max(0, Math.min(excedente, input.utilidadesNoDistribuidas));

  const capitalTrabajoCubierto = efectivo_operativo >= capital_trabajo;
  const reservaCompleta = input.reservaAcumulada >= input.reservaMeta;
  const abono_permitido = capitalTrabajoCubierto && reservaCompleta && excedente > 0;
  const disponible_abono = abono_permitido ? excedente : 0;

  const sugerido_retiro = Math.min(utilidad_distribuible, Math.round((excedente * input.porcentajeRetiro) / 100));
  const sugerido_abono = abono_permitido ? excedente - sugerido_retiro : 0;

  return {
    efectivo_caja: input.efectivoCaja,
    efectivo_banco: input.efectivoBanco,
    efectivo_operativo,
    cuentas_por_pagar: input.cuentasPorPagar,
    gastos_pendientes: input.gastosPendientes,
    compromisos_compra: input.compromisosCompra,
    pendientes,
    reposicion_inventario: input.reposicionInventario,
    cuota_pendiente: input.cuotaPendiente,
    capital_trabajo,
    reserva_meta: input.reservaMeta,
    reserva_acumulada: input.reservaAcumulada,
    faltante_reserva,
    excedente,
    deficit: Math.max(0, -saldo),
    utilidades_no_distribuidas: input.utilidadesNoDistribuidas,
    utilidad_distribuible,
    disponible_abono,
    abono_permitido,
    sugerido_retiro,
    sugerido_abono,
  };
}

export type WaterfallResult = ReturnType<typeof waterfall>;

export type WithdrawalDecision =
  | { allowed: true; descapitalizacion: boolean }
  | { allowed: false; reason: string };

// A withdrawal up to the distributable profit is accepted. Above it, only an explicit
// forced withdrawal (owner, with a reason) goes through, flagged as descapitalizacion, and
// never while the inventory figures are an estimate
export function evaluateWithdrawal(
  monto: number,
  cascada: Pick<WaterfallResult, 'utilidad_distribuible'>,
  options: { forzar: boolean; motivo?: string; inventarioEstimado: boolean },
): WithdrawalDecision {
  if (monto <= cascada.utilidad_distribuible) return { allowed: true, descapitalizacion: false };

  const exceso = `El retiro (${monto}) supera la utilidad distribuible (${cascada.utilidad_distribuible})`;
  if (!options.forzar) {
    return { allowed: false, reason: `${exceso}. Para registrarlo de todas formas envía forzar y un motivo` };
  }
  if (!options.motivo?.trim()) {
    return { allowed: false, reason: `${exceso}. Un retiro forzado requiere motivo` };
  }
  if (options.inventarioEstimado) {
    return {
      allowed: false,
      reason: `${exceso}. No se puede forzar mientras el inventario es una estimación (products-ms u orders-ms no responden)`,
    };
  }
  return { allowed: true, descapitalizacion: true };
}

// A prepayment needs working capital covered and the reserve complete, and never exceeds
// the surplus. There is no override
export function evaluatePrepayment(
  monto: number,
  cascada: Pick<WaterfallResult, 'abono_permitido' | 'disponible_abono' | 'faltante_reserva' | 'deficit'>,
): { allowed: true } | { allowed: false; reason: string } {
  if (!cascada.abono_permitido) {
    const reasons = [
      cascada.deficit > 0 && `faltan ${cascada.deficit} para cubrir el capital de trabajo y la reserva`,
      cascada.faltante_reserva > 0 && `la reserva está ${cascada.faltante_reserva} por debajo de la meta`,
    ].filter(Boolean);
    return {
      allowed: false,
      reason: `No hay dinero disponible para abonos extraordinarios${reasons.length ? `: ${reasons.join('; ')}` : ''}`,
    };
  }
  if (monto > cascada.disponible_abono) {
    return {
      allowed: false,
      reason: `El abono (${monto}) supera el disponible para abonos extraordinarios (${cascada.disponible_abono})`,
    };
  }
  return { allowed: true };
}
