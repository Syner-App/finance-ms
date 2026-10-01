import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { IsAmount } from '../../common/dtos/validators.ts';
import { RecipeItemDto } from './recipe-item.dto.ts';

export class UpdateRecipeDto {
    @IsMongoId()
    public organization_id: string;

    @IsInt()
    @IsPositive()
    public id: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @IsOptional()
    public nombre?: string;

    @IsAmount()
    @IsOptional()
    public precio_venta?: number;

    @IsBoolean()
    @IsOptional()
    public activo?: boolean;

    // Empty or missing keeps the current items
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecipeItemDto)
    @IsOptional()
    public items?: RecipeItemDto[];
}
