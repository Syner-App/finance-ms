import { Module } from '@nestjs/common';
import { GrpcModule } from '../transport/grpc.module.ts';
import { InventoryClient } from './inventory.client.ts';
import { PurchasingClient } from './purchasing.client.ts';

@Module({
  imports: [GrpcModule],
  providers: [InventoryClient, PurchasingClient],
  exports: [InventoryClient, PurchasingClient],
})
export class IntegrationsModule {}
