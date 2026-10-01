import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsMongoId, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';
import { IsAmount } from '../../common/dtos/validators.ts';
import { RecipeItemDto } from './recipe-item.dto.ts';

export class CreateRecipeDto {
    @IsMongoId()
    public organization_id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public nombre: string;

    @IsAmount()
    public precio_venta: number;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => RecipeItemDto)
    public items: RecipeItemDto[];
}
