import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsMongoId, IsOptional, IsPositive, Max, ValidateNested } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

export class SaleLineDto {
    @IsInt()
    @IsPositive()
    public recipe_id: number;

    @IsInt()
    @IsPositive()
    @Max(100_000)
    public unidades: number;

    // Defaults to the recipe price
    @IsAmount()
    @IsOptional()
    public precio_unitario?: number;
}

// One sale or the sales of a whole day, by recipe
export class RegisterSaleDto {
    @IsMongoId()
    public organization_id: string;

    @IsDay()
    @IsOptional()
    public fecha?: string;

    @IsCashAccount()
    public cuenta: Account;

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => SaleLineDto)
    public lineas: SaleLineDto[];
}
