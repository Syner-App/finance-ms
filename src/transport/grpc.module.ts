import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { envs } from '../config/envs.ts';
import { ORDERS_SERVICE, PRODUCTS_SERVICE } from '../config/services.ts';
import { PRODUCTS_PACKAGE_NAME } from '../generated/proto/products.ts';
import { ORDERS_PACKAGE_NAME } from '../generated/proto/orders.ts';

// snake_case fields and string enums, like the gateway
const loader = { keepCase: true, enums: String };

// Copies of the products-ms and orders-ms contracts (src/proto): keep them in sync
const grpcClients = ClientsModule.register([
  {
    name: PRODUCTS_SERVICE,
    transport: Transport.GRPC,
    options: {
      package: PRODUCTS_PACKAGE_NAME,
      protoPath: join(import.meta.dirname, '../proto/products.proto'),
      url: `${envs.productsMicroserviceHost}:${envs.productsMicroservicePort}`,
      loader,
    },
  },
  {
    name: ORDERS_SERVICE,
    transport: Transport.GRPC,
    options: {
      package: ORDERS_PACKAGE_NAME,
      protoPath: join(import.meta.dirname, '../proto/orders.proto'),
      url: `${envs.ordersMicroserviceHost}:${envs.ordersMicroservicePort}`,
      loader,
    },
  },
]);

@Module({
  imports: [grpcClients],
  exports: [grpcClients],
})
export class GrpcModule {}
