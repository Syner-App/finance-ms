import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { Logger, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { join } from 'path';
import { envs, FINANCE_EVENTS_QUEUE, SYNER_DLX, SYNER_EXCHANGE } from './config/index.ts';
import { FINANCE_PACKAGE_NAME } from './generated/proto/finance.ts';
import { PrismaExceptionFilter } from './common/index.ts';

async function bootstrap() {
  const logger = new Logger('Finance-Ms')

  // Hybrid app: gRPC for the gateway + RabbitMQ for the events of orders-ms and products-ms
  // (no HTTP server)
  const app = await NestFactory.create(AppModule);

  // Global enhancers must be registered before connectMicroservice() so
  // inheritAppConfig can copy them to every microservice
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new RpcException({
          code: status.INVALID_ARGUMENT,
          message: errors
            .flatMap(function messages(error): string[] {
              return [...Object.values(error.constraints ?? {}), ...(error.children ?? []).flatMap(messages)];
            })
            .join(', '),
        }),
    })
  )
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.GRPC,
      options: {
        package: FINANCE_PACKAGE_NAME,
        protoPath: join(import.meta.dirname, 'proto/finance.proto'),
        url: `0.0.0.0:${envs.port}`,
        // snake_case fields and string enums, matching the Prisma models; int64 amounts as numbers
        loader: { keepCase: true, enums: String, longs: Number },
      },
    },
    { inheritAppConfig: true },
  );

  // One inbox queue: with wildcards the server binds it to the pattern of every RMQ handler
  // of the app (purchase-order.received, finance.sale.stock.applied|rejected)
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [envs.rabbitmqUrl],
        queue: FINANCE_EVENTS_QUEUE,
        queueOptions: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': SYNER_DLX,
            'x-dead-letter-routing-key': FINANCE_EVENTS_QUEUE,
          },
        },
        exchange: SYNER_EXCHANGE,
        exchangeType: 'topic',
        wildcards: true,
        noAck: false,
        prefetchCount: 10,
      },
    },
    { inheritAppConfig: true },
  );

  // init() first so lifecycle hooks finish before any message is consumed
  await app.init();
  await app.startAllMicroservices();
  logger.log(`Finance MS (gRPC) listening on port ${envs.port}`)
  logger.log(`Finance MS (RMQ) consuming queue ${FINANCE_EVENTS_QUEUE}`)
}
await bootstrap();
