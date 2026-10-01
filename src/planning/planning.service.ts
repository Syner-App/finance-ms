import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import type { Assumptions } from '../generated/prisma/client.ts';
import { envs } from '../config/envs.ts';
import { failedPrecondition, fromDbDate, toDbDate, today } from '../common/index.ts';
import { DEFAULT_POLICY, fixedCostsOf, loadAssumptions, loadPolicy } from './planning.queries.ts';
import type { SetAssumptionsDto, UpdatePolicyDto } from './dto/index.ts';

@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) { }

  // A new version; the same vigente_desde replaces that version
  async setAssumptions({ organization_id, vigente_desde, ...values }: SetAssumptionsDto) {
    const date = vigente_desde ?? today(envs.businessTimezone);
    const data = { ...values, costo_variable_unitario: values.costo_variable_unitario ?? null };

    const assumptions = await this.prisma.withTenant(organization_id, (tx) =>
      tx.assumptions.upsert({
        where: { organization_id_vigente_desde: { organization_id, vigente_desde: toDbDate(date) } },
        create: { organization_id, vigente_desde: toDbDate(date), ...data },
        update: data,
      }),
    );
    return this.toAssumptionsResponse(assumptions);
  }

  async getAssumptions(organization_id: string) {
    const assumptions = await this.prisma.withTenant(organization_id, (tx) =>
      loadAssumptions(tx, organization_id, today(envs.businessTimezone)),
    );
    if (!assumptions) throw failedPrecondition('Register the break-even assumptions first');
    return this.toAssumptionsResponse(assumptions);
  }

  async getPolicy(organization_id: string) {
    return this.prisma.withTenant(organization_id, (tx) => loadPolicy(tx, organization_id));
  }

  async updatePolicy({ organization_id, niveles_escenario, categorias_variables, ...values }: UpdatePolicyDto) {
    const data = {
      ...values,
      // Empty repeated fields keep the current values
      ...(niveles_escenario?.length && { niveles_escenario: [...new Set(niveles_escenario)].sort((a, b) => a - b) }),
      ...(categorias_variables?.length && { categorias_variables: [...new Set(categorias_variables)] }),
    };

    return this.prisma.withTenant(organization_id, async (tx) => {
      await tx.policy.upsert({
        where: { organization_id },
        create: { organization_id, ...DEFAULT_POLICY, ...data },
        update: data,
      });
      return loadPolicy(tx, organization_id);
    });
  }

  private toAssumptionsResponse(assumptions: Assumptions) {
    return {
      id: assumptions.id,
      vigente_desde: fromDbDate(assumptions.vigente_desde),
      precio_promedio: assumptions.precio_promedio,
      costo_variable_unitario: assumptions.costo_variable_unitario ?? undefined,
      arriendo: assumptions.arriendo,
      servicios: assumptions.servicios,
      salarios: assumptions.salarios,
      otros_fijos: assumptions.otros_fijos,
      dias_operacion: assumptions.dias_operacion,
      inversion_inicial: assumptions.inversion_inicial,
      costos_fijos: fixedCostsOf(assumptions),
    };
  }
}
