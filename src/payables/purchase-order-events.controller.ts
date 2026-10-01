import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext, Transport } from '@nestjs/microservices';
import { PayablesService } from './payables.service.ts';
import { processEvent, PurchaseOrderEvents, PurchaseOrderReceivedEvent } from '../common/index.ts';

// purchase-order.received, published by orders-ms. finance.events gets its own copy (topic
// exchange): products-ms keeps adding the stock from its queue as before
@Controller()
export class PurchaseOrderEventsController {
  private readonly logger = new Logger(PurchaseOrderEventsController.name);

  constructor(private readonly payablesService: PayablesService) { }

  // <string> selects the untyped overload; the typed one forbids a typed @Ctx() argument
  @EventPattern<string>(PurchaseOrderEvents.Received, Transport.RMQ)
  handlePurchaseOrderReceived(@Payload() payload: unknown, @Ctx() context: RmqContext) {
    return processEvent(this.logger, PurchaseOrderEvents.Received, PurchaseOrderReceivedEvent, payload, context,
      (event) => this.payablesService.registerReceived(event));
  }
}
