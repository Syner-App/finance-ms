import { IsInt, IsNumber, IsPositive, Max } from 'class-validator';

export class RecipeItemDto {
    @IsInt()
    @IsPositive()
    public supply_id: number;

    // Units of the products-ms product used by one unit sold (may be a fraction)
    @IsNumber({ maxDecimalPlaces: 4 })
    @IsPositive()
    @Max(1_000_000)
    public cantidad: number;
}
