import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { INTEGRATION_TIMEOUT_MS, PRODUCTS_SERVICE } from '../config/services.ts';
import { PRODUCTS_SERVICE_NAME, type Product, type ProductsServiceClient } from '../generated/proto/products.ts';

const PAGE_SIZE = 100;

export interface StockLevel {
  stock_actual: number;
  stock_minimo: number;
}

// Read-only access to products-ms (the source of truth of the supplies and their stock).
// Every call carries the organization, so products-ms (and its RLS) only answers with the
// products of that organization: a foreign id is NOT_FOUND
@Injectable()
export class InventoryClient implements OnModuleInit {
  private productsService: ProductsServiceClient;

  constructor(@Inject(PRODUCTS_SERVICE) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.productsService = this.client.getService<ProductsServiceClient>(PRODUCTS_SERVICE_NAME);
  }

  findProduct(organization_id: string, id: number): Promise<Product> {
    return lastValueFrom(this.productsService.findOne({ id, organization_id }).pipe(timeout(INTEGRATION_TIMEOUT_MS)));
  }

  // Stock of the given products. Inactive products are not listed by products-ms, so they
  // are missing from the result
  async findStock(organization_id: string, ids: readonly number[]): Promise<Map<number, StockLevel>> {
    const wanted = new Set(ids);
    const stock = new Map<number, StockLevel>();
    if (!wanted.size) return stock;

    let page = 1;
    let lastPage = 1;
    do {
      const { data, meta } = await lastValueFrom(
        this.productsService.findAll({ organization_id, page, limit: PAGE_SIZE }).pipe(timeout(INTEGRATION_TIMEOUT_MS)),
      );
      for (const product of data ?? []) {
        if (wanted.has(product.id)) {
          stock.set(product.id, { stock_actual: product.stock_actual ?? 0, stock_minimo: product.stock_minimo ?? 0 });
        }
      }
      lastPage = meta?.lastPage ?? 1;
      page++;
    } while (page <= lastPage && stock.size < wanted.size);

    return stock;
  }
}
