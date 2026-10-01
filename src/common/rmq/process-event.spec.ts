import { Logger } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { processEvent } from './process-event.ts';
import { SaleStockAppliedEvent } from '../events/index.ts';

const organization_id = '6abd26a42d059ac027376ca1';
const saleId = '5f0c6b8e-1d3a-4f6e-9b2a-7c1d2e3f4a5b';

describe('processEvent', () => {
  const channel = { ack: vi.fn(), nack: vi.fn() };
  const logger = { error: vi.fn() } as unknown as Logger;
  const context = (redelivered = false) =>
    new RmqContext([{ fields: { redelivered } }, channel, 'finance.sale.stock.applied']);

  beforeEach(() => vi.resetAllMocks());

  it('acks after the handler succeeds', async () => {
    const handler = vi.fn().mockResolvedValue(true);

    await processEvent(logger, 'p', SaleStockAppliedEvent, { organization_id, saleId }, context(), handler);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ organization_id, saleId }));
    expect(channel.ack).toHaveBeenCalled();
  });

  it('dead-letters an invalid payload without calling the handler', async () => {
    const handler = vi.fn();

    await processEvent(logger, 'p', SaleStockAppliedEvent, { organization_id: 'nope', saleId }, context(), handler);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues a failure once and dead-letters it when redelivered', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('database down'));

    await processEvent(logger, 'p', SaleStockAppliedEvent, { organization_id, saleId }, context(false), handler);
    await processEvent(logger, 'p', SaleStockAppliedEvent, { organization_id, saleId }, context(true), handler);

    expect(channel.nack.mock.calls.map(([, , requeue]) => requeue)).toEqual([true, false]);
  });
});
