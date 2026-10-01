import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { LedgerService } from './ledger.service.ts';
import {
  FindMovementsDto,
  PayExpenseDto,
  RegisterContributionDto,
  RegisterExpenseDto,
  TransferReserveDto,
} from './dto/index.ts';

// Served by the gRPC FinanceService, like every other controller of finance-ms
@Controller()
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'RegisterExpense')
  registerExpense(@Payload() registerExpenseDto: RegisterExpenseDto) {
    return this.ledgerService.registerExpense(registerExpenseDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'PayExpense')
  payExpense(@Payload() payExpenseDto: PayExpenseDto) {
    return this.ledgerService.payExpense(payExpenseDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'RegisterContribution')
  registerContribution(@Payload() registerContributionDto: RegisterContributionDto) {
    return this.ledgerService.registerContribution(registerContributionDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'TransferReserve')
  transferReserve(@Payload() transferReserveDto: TransferReserveDto) {
    return this.ledgerService.transferReserve(transferReserveDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'FindMovements')
  findMovements(@Payload() findMovementsDto: FindMovementsDto) {
    return this.ledgerService.findMovements(findMovementsDto);
  }
}
