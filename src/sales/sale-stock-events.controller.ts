import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext, Transport } from '@nestjs/microservices';
import { SalesService } from './sales.service.ts';
import { FinanceEvents, processEvent, SaleStockAppliedEvent, SaleStockRejectedEvent } from '../common/index.ts';

// Replies of products-ms to finance.sale.registered (queue finance.events)
@Controller()
export class SaleStockEventsController {
  private readonly logger = new Logger(SaleStockEventsController.name);

  constructor(private readonly salesService: SalesService) { }

  // <string> selects the untyped overload; the typed one forbids a typed @Ctx() argument
  @EventPattern<string>(FinanceEvents.SaleStockApplied, Transport.RMQ)
  handleStockApplied(@Payload() payload: unknown, @Ctx() context: RmqContext) {
    return processEvent(this.logger, FinanceEvents.SaleStockApplied, SaleStockAppliedEvent, payload, context,
      (event) => this.salesService.markStockApplied(event));
  }

  @EventPattern<string>(FinanceEvents.SaleStockRejected, Transport.RMQ)
  handleStockRejected(@Payload() payload: unknown, @Ctx() context: RmqContext) {
    return processEvent(this.logger, FinanceEvents.SaleStockRejected, SaleStockRejectedEvent, payload, context,
      (event) => this.salesService.markStockRejected(event));
  }
}
