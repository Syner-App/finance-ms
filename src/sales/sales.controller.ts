import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { FINANCE_SERVICE_NAME } from '../generated/proto/finance.ts';
import { SalesService } from './sales.service.ts';
import { FindSalesDto, RegisterSaleDto, SaleByIdDto } from './dto/index.ts';

@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) { }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'RegisterSale')
  registerSale(@Payload() registerSaleDto: RegisterSaleDto) {
    return this.salesService.registerSale(registerSaleDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'FindSales')
  findSales(@Payload() findSalesDto: FindSalesDto) {
    return this.salesService.findSales(findSalesDto);
  }

  @GrpcMethod(FINANCE_SERVICE_NAME, 'RetrySaleStock')
  retrySaleStock(@Payload() saleByIdDto: SaleByIdDto) {
    return this.salesService.retrySaleStock(saleByIdDto);
  }
}
