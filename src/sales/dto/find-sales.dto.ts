import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { StatusStockDeduction } from '../../generated/prisma/enums.ts';
import { PaginationDto } from '../../common/dtos/pagination.dto.ts';
import { IsPeriod } from '../../common/dtos/validators.ts';

export class FindSalesDto extends PaginationDto {
    @IsMongoId()
    public organization_id: string;

    @IsPeriod()
    @IsOptional()
    public periodo?: string;

    @IsEnum(StatusStockDeduction, {
        message: `Possible estado_stock values are ${Object.values(StatusStockDeduction).join(', ')}`,
    })
    @IsOptional()
    public estado_stock?: StatusStockDeduction;
}
