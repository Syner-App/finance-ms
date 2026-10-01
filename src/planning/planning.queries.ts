import type { Assumptions, Prisma } from '../generated/prisma/client.ts';
import { MovementCategory } from '../generated/prisma/enums.ts';
import { toDbDate } from '../common/dates.ts';

export interface PolicyValues {
  dias_cobertura: number;
  meses_reserva: number;
  porcentaje_retiro: number;
  niveles_escenario: number[];
  categorias_variables: MovementCategory[];
}

// Defaults of the politicas table (an organization without a row uses them)
export const DEFAULT_POLICY: PolicyValues = {
  dias_cobertura: 7,
  meses_reserva: 1,
  porcentaje_retiro: 50,
  niveles_escenario: [30, 50, 75, 100, 150],
  categorias_variables: [MovementCategory.MATERIA_PRIMA, MovementCategory.EMPAQUES, MovementCategory.TRANSPORTE],
};

export async function loadPolicy(tx: Prisma.TransactionClient, organization_id: string): Promise<PolicyValues> {
  const policy = await tx.policy.findUnique({ where: { organization_id } });
  if (!policy) return DEFAULT_POLICY;
  return {
    dias_cobertura: policy.dias_cobertura,
    meses_reserva: Number(policy.meses_reserva),
    porcentaje_retiro: policy.porcentaje_retiro,
    niveles_escenario: policy.niveles_escenario,
    categorias_variables: policy.categorias_variables,
  };
}

// The version in force on `date`: the latest vigente_desde <= date
export function loadAssumptions(tx: Prisma.TransactionClient, organization_id: string, date: string) {
  return tx.assumptions.findFirst({
    where: { organization_id, vigente_desde: { lte: toDbDate(date) } },
    orderBy: { vigente_desde: 'desc' },
  });
}

export const fixedCostsOf = (assumptions: Pick<Assumptions, 'arriendo' | 'servicios' | 'salarios' | 'otros_fijos'>) =>
  assumptions.arriendo + assumptions.servicios + assumptions.salarios + assumptions.otros_fijos;
