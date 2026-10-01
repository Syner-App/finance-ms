import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

interface GrpcError {
  code: number;
  details?: string;
}

const isGrpcError = (error: unknown): error is GrpcError =>
  typeof error === 'object' && error !== null && typeof (error as GrpcError).code === 'number';

// An error of a gRPC call to products-ms/orders-ms, as an RpcException with the same status
// (a product of another organization stays NOT_FOUND). A timeout is UNAVAILABLE
export function toRpcException(error: unknown, service: string): RpcException {
  if (isGrpcError(error)) {
    return new RpcException({ code: error.code, message: error.details ?? `${service} failed` });
  }
  return new RpcException({
    code: status.UNAVAILABLE,
    message: `${service} is not available: ${(error as Error)?.message ?? error}`,
  });
}
