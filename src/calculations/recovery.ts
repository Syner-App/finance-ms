import { roundTo, sum } from './rounding.ts';

// Recovery of the initial investment with the available cash flow of each month
// (chronological order). The months left use the average of the last three
export function recovery(inversionInicial: number, flujosMensuales: readonly number[]) {
  const recuperado = Math.max(0, sum(flujosMensuales));
  const pendiente = Math.max(0, inversionInicial - recuperado);

  const ultimos = flujosMensuales.slice(-3);
  const promedio = ultimos.length ? sum(ultimos) / ultimos.length : 0;

  return {
    inversion_inicial: inversionInicial,
    recuperado,
    porcentaje: inversionInicial > 0 ? roundTo(Math.min(100, (recuperado / inversionInicial) * 100), 1) : undefined,
    meses_restantes: pendiente === 0 ? 0 : promedio > 0 ? roundTo(pendiente / promedio, 1) : undefined,
  };
}
