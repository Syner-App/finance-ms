import type { Movement } from '../generated/prisma/client.ts';
import { fromDbDate } from '../common/dates.ts';

// proto-loader cannot serialize Date objects, so dates travel as strings. Nullable columns
// become undefined so the optional proto fields stay unset
export const toMovementResponse = (movement: Movement) => ({
  id: movement.id,
  tipo: movement.tipo,
  categoria: movement.categoria,
  monto: movement.monto,
  periodo: movement.periodo,
  fecha: fromDbDate(movement.fecha),
  estado: movement.estado,
  cuenta: movement.cuenta ?? undefined,
  pagado_en: movement.pagado_en ? fromDbDate(movement.pagado_en) : undefined,
  descripcion: movement.descripcion ?? undefined,
  descapitalizacion: movement.descapitalizacion,
  referencia_id: movement.referencia_id ?? undefined,
  createdAt: movement.createdAt.toISOString(),
});
