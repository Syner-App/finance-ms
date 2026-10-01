import { IsInt, IsMongoId, IsPositive, IsUUID } from 'class-validator';

// The purchase order saga event finance-ms listens to (its own queue, finance.events, gets a
// copy of it; products-ms keeps receiving its own). Keep in sync with
// orders-ms/src/common/events/purchase-order.events.ts
export const PurchaseOrderEvents = {
  Received: 'purchase-order.received',
} as const;

export class PurchaseOrderReceivedEvent {
  @IsMongoId()
  organization_id: string;

  @IsUUID()
  purchaseOrderId: string;

  @IsInt()
  @IsPositive()
  producto_id: number;

  @IsInt()
  @IsPositive()
  cantidad: number;
}
