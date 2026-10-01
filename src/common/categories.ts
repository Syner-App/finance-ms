import { MovementCategory } from '../generated/prisma/enums.ts';

// The category of a movement fixes its nature, so an owner withdrawal or a credit
// installment can never be counted as an operating expense
export type Nature = 'OPERATIVO_INGRESO' | 'OPERATIVO_GASTO' | 'FINANCIERO' | 'PROPIETARIO' | 'INTERNO';

export const OPERATING_EXPENSES: readonly MovementCategory[] = [
  MovementCategory.MATERIA_PRIMA,
  MovementCategory.EMPAQUES,
  MovementCategory.TRANSPORTE,
  MovementCategory.SERVICIOS,
  MovementCategory.ARRIENDO,
  MovementCategory.SALARIOS,
  MovementCategory.PUBLICIDAD,
  MovementCategory.OTROS_OPERATIVOS,
];

// Categories of a supply (and so of the payable of its purchase orders)
export const SUPPLY_CATEGORIES: readonly MovementCategory[] = [
  MovementCategory.MATERIA_PRIMA,
  MovementCategory.EMPAQUES,
];

export const natureOf = (categoria: MovementCategory): Nature => {
  if (categoria === MovementCategory.VENTAS) return 'OPERATIVO_INGRESO';
  if (OPERATING_EXPENSES.includes(categoria)) return 'OPERATIVO_GASTO';
  switch (categoria) {
    case MovementCategory.CUOTA_CREDITO:
    case MovementCategory.ABONO_EXTRAORDINARIO:
      return 'FINANCIERO';
    case MovementCategory.RETIRO_PROPIETARIO:
    case MovementCategory.APORTE_PROPIETARIO:
      return 'PROPIETARIO';
    default:
      return 'INTERNO';
  }
};

export const isOperatingExpense = (categoria: MovementCategory) => OPERATING_EXPENSES.includes(categoria);
