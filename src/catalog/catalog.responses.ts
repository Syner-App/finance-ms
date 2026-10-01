import type { Prisma, Supply } from '../generated/prisma/client.ts';
import { recipeUnitCost, roundTo } from '../calculations/index.ts';

export const RECIPE_INCLUDE = { items: { include: { supply: true }, orderBy: { id: 'asc' } } } as const;

export type RecipeWithItems = Prisma.RecipeGetPayload<{ include: typeof RECIPE_INCLUDE }>;

export const toSupplyResponse = (supply: Supply) => ({
  id: supply.id,
  producto_id: supply.producto_id,
  nombre: supply.nombre,
  categoria: supply.categoria,
  costo_unitario: Number(supply.costo_unitario),
  consumo_pendiente: Number(supply.consumo_pendiente),
  createdAt: supply.createdAt.toISOString(),
  updatedAt: supply.updatedAt?.toISOString(),
});

// Unit cost of a recipe with the current reference cost of its supplies
export const recipeCost = (recipe: RecipeWithItems) =>
  recipeUnitCost(
    recipe.items.map((item) => ({ cantidad: Number(item.cantidad), costo_unitario: Number(item.supply.costo_unitario) })),
  );

export function toRecipeResponse(recipe: RecipeWithItems) {
  const costo_unitario = recipeCost(recipe);
  return {
    id: recipe.id,
    nombre: recipe.nombre,
    precio_venta: recipe.precio_venta,
    activo: recipe.activo,
    costo_unitario,
    margen_unitario: roundTo(recipe.precio_venta - costo_unitario, 4),
    items: recipe.items.map((item) => ({
      supply_id: item.supply_id,
      producto_id: item.supply.producto_id,
      nombre: item.supply.nombre,
      cantidad: Number(item.cantidad),
      costo: roundTo(Number(item.cantidad) * Number(item.supply.costo_unitario), 4),
    })),
  };
}
