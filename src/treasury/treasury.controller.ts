import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { OrganizationDto } from '../common/index.ts';
import { PrepayCreditDto } from '../credits/dto/index.ts';
import { TreasuryService } from './treasury.service.ts';
import { PeriodDto, RegisterWithdrawalDto, ReopenPeriodDto, ScenariosDto } from './dto/index.ts';

// Reports and the money decisions that depend on the waterfall (withdrawals, prepayments)
@Controller()
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetIncomeStatement')
  getIncomeStatement(@Payload() periodDto: PeriodDto) {
    return this.treasuryService.getIncomeStatement(periodDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetWaterfall')
  getWaterfall(@Payload() { organization_id }: OrganizationDto) {
    return this.treasuryService.getWaterfall(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'RegisterWithdrawal')
  registerWithdrawal(@Payload() registerWithdrawalDto: RegisterWithdrawalDto) {
    return this.treasuryService.registerWithdrawal(registerWithdrawalDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'PrepayCredit')
  prepayCredit(@Payload() prepayCreditDto: PrepayCreditDto) {
    return this.treasuryService.prepayCredit(prepayCreditDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetBreakEven')
  getBreakEven(@Payload() { organization_id }: OrganizationDto) {
    return this.treasuryService.getBreakEven(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetScenarios')
  getScenarios(@Payload() scenariosDto: ScenariosDto) {
    return this.treasuryService.getScenarios(scenariosDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetDashboard')
  getDashboard(@Payload() { organization_id }: OrganizationDto) {
    return this.treasuryService.getDashboard(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'ClosePeriod')
  closePeriod(@Payload() periodDto: PeriodDto) {
    return this.treasuryService.closePeriod(periodDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'ReopenPeriod')
  reopenPeriod(@Payload() reopenPeriodDto: ReopenPeriodDto) {
    return this.treasuryService.reopenPeriod(reopenPeriodDto);
  }
}
