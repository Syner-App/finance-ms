import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { INTEGRATION_TIMEOUT_MS, ORDERS_SERVICE } from '../config/services.ts';
import {
  PURCHASE_ORDERS_SERVICE_NAME,
  StatusPurchaseOrder,
  type PurchaseOrdersServiceClient,
} from '../generated/proto/orders.ts';

const PAGE_SIZE = 100;

// Purchase orders that will still bring goods (and a bill): not received nor rejected
const OPEN_STATUSES = [StatusPurchaseOrder.EN_VALIDACION, StatusPurchaseOrder.PENDIENTE, StatusPurchaseOrder.APROBADA];

// Read-only access to orders-ms, scoped to the organization like InventoryClient
@Injectable()
export class PurchasingClient implements OnModuleInit {
  private purchaseOrdersService: PurchaseOrdersServiceClient;

  constructor(@Inject(ORDERS_SERVICE) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.purchaseOrdersService = this.client.getService<PurchaseOrdersServiceClient>(PURCHASE_ORDERS_SERVICE_NAME);
  }

  // Units on open purchase orders, by product
  async openOrderQuantities(organization_id: string): Promise<Map<number, number>> {
    const quantities = new Map<number, number>();

    for (const estado of OPEN_STATUSES) {
      let page = 1;
      let lastPage = 1;
      do {
        const { data, meta } = await lastValueFrom(
          this.purchaseOrdersService
            .findAll({ organization_id, estado, page, limit: PAGE_SIZE })
            .pipe(timeout(INTEGRATION_TIMEOUT_MS)),
        );
        for (const order of data ?? []) {
          quantities.set(order.producto_id, (quantities.get(order.producto_id) ?? 0) + (order.cantidad_solicitada ?? 0));
        }
        lastPage = meta?.lastPage ?? 1;
        page++;
      } while (page <= lastPage);
    }

    return quantities;
  }
}
