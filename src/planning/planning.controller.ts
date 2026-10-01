import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { OrganizationDto } from '../common/index.ts';
import { PlanningService } from './planning.service.ts';
import { SetAssumptionsDto, UpdatePolicyDto } from './dto/index.ts';

@Controller()
export class PlanningController {
  constructor(private readonly planningService: PlanningService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'SetAssumptions')
  setAssumptions(@Payload() setAssumptionsDto: SetAssumptionsDto) {
    return this.planningService.setAssumptions(setAssumptionsDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetAssumptions')
  getAssumptions(@Payload() { organization_id }: OrganizationDto) {
    return this.planningService.getAssumptions(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'GetPolicy')
  getPolicy(@Payload() { organization_id }: OrganizationDto) {
    return this.planningService.getPolicy(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'UpdatePolicy')
  updatePolicy(@Payload() updatePolicyDto: UpdatePolicyDto) {
    return this.planningService.updatePolicy(updatePolicyDto);
  }
}
