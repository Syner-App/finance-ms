import type { Logger } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import type { ClassConstructor } from 'class-transformer';
import { parseEvent } from '../events/parse-event.ts';
import { rmqMessage } from './rmq-message.ts';

// Validates and handles one event of the finance.events queue. Invalid payloads are
// dead-lettered straight away; a processing error is retried once through the queue and
// dead-lettered (finance.events.dlq) on the second failure. Handlers are idempotent
export async function processEvent<T extends object>(
  logger: Logger,
  pattern: string,
  cls: ClassConstructor<T>,
  payload: unknown,
  context: RmqContext,
  handler: (event: T) => Promise<unknown>,
) {
  const message = rmqMessage(context);

  const parsed = await parseEvent(cls, payload);
  if ('errors' in parsed) {
    logger.error(`Invalid ${pattern} payload, dead-lettering: ${parsed.errors}`);
    message.nack(false);
    return;
  }

  try {
    await handler(parsed.event);
    message.ack();
  } catch (error) {
    const requeue = !message.redelivered;
    logger.error(
      `Failed to process ${pattern} (${requeue ? 'requeued' : 'dead-lettered'}): ${(error as Error)?.message ?? error}`,
    );
    message.nack(requeue);
  }
}
