import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { InventoryClient, toRpcException } from '../integrations/index.ts';
import { failedPrecondition, invalidArgument, notFound } from '../common/index.ts';
import { RECIPE_INCLUDE, toRecipeResponse, toSupplyResponse } from './catalog.responses.ts';
import type { CreateRecipeDto, RecipeItemDto, UpsertSupplyDto, UpdateRecipeDto } from './dto/index.ts';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryClient,
  ) { }

  // The product must exist in products-ms within the same organization (a foreign one is
  // NOT_FOUND there). A new cost is kept in the supply's cost history
  async upsertSupply({ organization_id, producto_id, categoria, costo_unitario }: UpsertSupplyDto) {
    const product = await this.inventory.findProduct(organization_id, producto_id).catch((error: unknown) => {
      throw toRpcException(error, 'products-ms');
    });

    const supply = await this.prisma.withTenant(organization_id, async (tx) => {
      const existing = await tx.supply.findUnique({
        where: { organization_id_producto_id: { organization_id, producto_id } },
      });

      const supply = await tx.supply.upsert({
        where: { organization_id_producto_id: { organization_id, producto_id } },
        create: { organization_id, producto_id, nombre: product.nombre, categoria, costo_unitario },
        update: { nombre: product.nombre, categoria, costo_unitario },
      });

      if (!existing || Number(existing.costo_unitario) !== costo_unitario) {
        await tx.supplyCost.create({
          data: { organization_id, supply_id: supply.id, costo_unitario, origen: 'MANUAL' },
        });
      }
      return supply;
    });

    return toSupplyResponse(supply);
  }

  async findSupplies(organization_id: string) {
    const supplies = await this.prisma.withTenant(organization_id, (tx) =>
      tx.supply.findMany({ where: { organization_id }, orderBy: { nombre: 'asc' } }),
    );
    return { data: supplies.map(toSupplyResponse) };
  }

  async createRecipe({ organization_id, nombre, precio_venta, items }: CreateRecipeDto) {
    const recipe = await this.prisma.withTenant(organization_id, async (tx) => {
      await this.assertSupplies(tx, organization_id, items);
      return tx.recipe.create({
        data: {
          organization_id,
          nombre,
          precio_venta,
          items: { create: items.map(({ supply_id, cantidad }) => ({ organization_id, supply_id, cantidad })) },
        },
        include: RECIPE_INCLUDE,
      });
    });
    return toRecipeResponse(recipe);
  }

  async updateRecipe({ organization_id, id, nombre, precio_venta, activo, items }: UpdateRecipeDto) {
    const recipe = await this.prisma.withTenant(organization_id, async (tx) => {
      const existing = await tx.recipe.findUnique({ where: { id, organization_id }, select: { id: true } });
      if (!existing) throw notFound(`Recipe with id: #${id} not found`);

      if (items?.length) {
        await this.assertSupplies(tx, organization_id, items);
        await tx.recipeItem.deleteMany({ where: { recipe_id: id, organization_id } });
        await tx.recipeItem.createMany({
          data: items.map(({ supply_id, cantidad }) => ({ organization_id, recipe_id: id, supply_id, cantidad })),
        });
      }

      return tx.recipe.update({
        where: { id, organization_id },
        data: { nombre, precio_venta, activo },
        include: RECIPE_INCLUDE,
      });
    });
    return toRecipeResponse(recipe);
  }

  async findRecipes(organization_id: string) {
    const recipes = await this.prisma.withTenant(organization_id, (tx) =>
      tx.recipe.findMany({ where: { organization_id }, include: RECIPE_INCLUDE, orderBy: { nombre: 'asc' } }),
    );
    return { data: recipes.map(toRecipeResponse) };
  }

  // Every supply must belong to the organization and appear once
  private async assertSupplies(tx: Prisma.TransactionClient, organization_id: string, items: readonly RecipeItemDto[]) {
    const ids = items.map((item) => item.supply_id);
    if (new Set(ids).size !== ids.length) throw invalidArgument('A supply appears more than once in the recipe');

    const found = await tx.supply.count({ where: { organization_id, id: { in: ids } } });
    if (found !== ids.length) {
      throw failedPrecondition('Every item must be a supply of the organization (link it first with UpsertSupply)');
    }
  }
}
