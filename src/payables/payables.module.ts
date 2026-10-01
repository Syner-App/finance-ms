import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller.ts';
import { PurchaseOrderEventsController } from './purchase-order-events.controller.ts';
import { PayablesService } from './payables.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';

@Module({
  imports: [OutboxModule],
  controllers: [PayablesController, PurchaseOrderEventsController],
  providers: [PayablesService],
})
export class PayablesModule {}
