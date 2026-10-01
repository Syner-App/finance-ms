import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

// Sale stock contract. Keep in sync with products-ms/src/common/events/finance.events.ts.
// A sale registered in finance-ms discounts the supplies of its recipes from the products-ms
// stock; products-ms answers with applied or rejected. Every event carries the organization
export const FinanceEvents = {
  SaleRegistered: 'finance.sale.registered',
  SaleStockApplied: 'finance.sale.stock.applied',
  SaleStockRejected: 'finance.sale.stock.rejected',
} as const;

export class SaleConsumption {
  @IsInt()
  @IsPositive()
  producto_id: number;

  @IsInt()
  @IsPositive()
  cantidad: number;
}

export class SaleRegisteredEvent {
  @IsMongoId()
  organization_id: string;

  @IsUUID()
  saleId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SaleConsumption)
  consumos: SaleConsumption[];
}

export class SaleStockAppliedEvent {
  @IsMongoId()
  organization_id: string;

  @IsUUID()
  saleId: string;
}

export class SaleStockRejectedEvent {
  @IsMongoId()
  organization_id: string;

  @IsUUID()
  saleId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}
