import { floorUnits, roundTo, sum } from './rounding.ts';

// products-ms counts whole units (a bag of ice), while a recipe may use a fraction of one
// (0.05 bags per granizado). The fraction is kept on the supply and only whole units are
// discounted: one bag every 20 granizados
export function accumulateConsumption(pendiente: number, consumo: number) {
  const total = roundTo(pendiente + consumo, 4);
  const descontar = floorUnits(total);
  return { descontar, pendiente: roundTo(total - descontar, 4) };
}

// Cost of one unit of a recipe: Σ quantity × reference cost of each supply
export const recipeUnitCost = (items: readonly { cantidad: number; costo_unitario: number }[]) =>
  roundTo(sum(items.map(({ cantidad, costo_unitario }) => cantidad * costo_unitario)), 4);

// Variable unit cost weighted by the units sold of each recipe
export function weightedUnitCost(lines: readonly { unidades: number; costo_unitario: number }[]) {
  const unidades = sum(lines.map((line) => line.unidades));
  if (unidades === 0) return undefined;
  return roundTo(sum(lines.map((line) => line.unidades * line.costo_unitario)) / unidades, 4);
}
