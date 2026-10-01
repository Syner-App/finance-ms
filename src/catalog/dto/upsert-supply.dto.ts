import { IsIn, IsInt, IsMongoId, IsNumber, IsPositive, Max } from 'class-validator';
import { MovementCategory } from '../../generated/prisma/enums.ts';
import { SUPPLY_CATEGORIES } from '../../common/categories.ts';

// Links a products-ms product as a supply (or updates its cost)
export class UpsertSupplyDto {
    @IsMongoId()
    public organization_id: string;

    @IsInt()
    @IsPositive()
    public producto_id: number;

    @IsIn(SUPPLY_CATEGORIES, { message: `Possible categoria values are ${SUPPLY_CATEGORIES.join(', ')}` })
    public categoria: MovementCategory;

    // Pesos per unit of the products-ms product
    @IsNumber({ maxDecimalPlaces: 4 })
    @IsPositive()
    @Max(100_000_000)
    public costo_unitario: number;
}
