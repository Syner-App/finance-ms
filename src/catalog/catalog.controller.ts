import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { OrganizationDto } from '../common/index.ts';
import { CatalogService } from './catalog.service.ts';
import { CreateRecipeDto, UpdateRecipeDto, UpsertSupplyDto } from './dto/index.ts';

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'UpsertSupply')
  upsertSupply(@Payload() upsertSupplyDto: UpsertSupplyDto) {
    return this.catalogService.upsertSupply(upsertSupplyDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'FindSupplies')
  findSupplies(@Payload() { organization_id }: OrganizationDto) {
    return this.catalogService.findSupplies(organization_id);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'CreateRecipe')
  createRecipe(@Payload() createRecipeDto: CreateRecipeDto) {
    return this.catalogService.createRecipe(createRecipeDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'UpdateRecipe')
  updateRecipe(@Payload() updateRecipeDto: UpdateRecipeDto) {
    return this.catalogService.updateRecipe(updateRecipeDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'FindRecipes')
  findRecipes(@Payload() { organization_id }: OrganizationDto) {
    return this.catalogService.findRecipes(organization_id);
  }
}
