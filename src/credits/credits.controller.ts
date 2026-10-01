import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { OrganizationDto } from '../common/index.ts';
import { CreditsService } from './credits.service.ts';
import { CreateCreditDto, PayInstallmentDto } from './dto/index.ts';

@Controller()
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'CreateCredit')
  createCredit(@Payload() createCreditDto: CreateCreditDto) {
    return this.creditsService.createCredit(createCreditDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'FindCredits')
  findCredits(@Payload() { organization_id }: OrganizationDto) {
    return this.creditsService.findCredits(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'PayInstallment')
  payInstallment(@Payload() payInstallmentDto: PayInstallmentDto) {
    return this.creditsService.payInstallment(payInstallmentDto);
  }
}
