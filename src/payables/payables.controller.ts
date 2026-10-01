import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { PayablesService } from './payables.service.ts';
import { FindPayablesDto, PayPayableDto } from './dto/index.ts';

@Controller()
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'FindPayables')
  findPayables(@Payload() findPayablesDto: FindPayablesDto) {
    return this.payablesService.findPayables(findPayablesDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'PayPayable')
  payPayable(@Payload() payPayableDto: PayPayableDto) {
    return this.payablesService.payPayable(payPayableDto);
  }
}
