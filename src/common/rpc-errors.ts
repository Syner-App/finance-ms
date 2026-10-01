import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

// Services throw RpcExceptions with a gRPC status (never HttpExceptions, which would reach
// the gateway as UNKNOWN)
export const notFound = (message: string) => new RpcException({ code: status.NOT_FOUND, message });

export const failedPrecondition = (message: string) =>
  new RpcException({ code: status.FAILED_PRECONDITION, message });

export const invalidArgument = (message: string) => new RpcException({ code: status.INVALID_ARGUMENT, message });
