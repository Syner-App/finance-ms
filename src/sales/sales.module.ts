import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller.ts';
import { SaleStockEventsController } from './sale-stock-events.controller.ts';
import { SalesService } from './sales.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';

@Module({
  imports: [OutboxModule],
  controllers: [SalesController, SaleStockEventsController],
  providers: [SalesService],
})
export class SalesModule {}
