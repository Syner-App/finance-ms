import { ArrayMaxSize, IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MovementCategory } from '../../generated/prisma/enums.ts';
import { OPERATING_EXPENSES } from '../../common/categories.ts';

export class UpdatePolicyDto {
    @IsMongoId()
    public organization_id: string;

    // Days of sales the inventory money must cover
    @IsInt()
    @Min(0)
    @Max(90)
    @IsOptional()
    public dias_cobertura?: number;

    // Reserve goal, in months of fixed costs
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(24)
    @IsOptional()
    public meses_reserva?: number;

    // Suggested share of the surplus for withdrawals; the rest, for credit prepayments
    @IsInt()
    @Min(0)
    @Max(100)
    @IsOptional()
    public porcentaje_retiro?: number;

    // Empty keeps the current levels
    @IsArray()
    @ArrayMaxSize(10)
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(100_000, { each: true })
    @IsOptional()
    public niveles_escenario?: number[];

    // Empty keeps the current ones; the other operating expenses are fixed costs
    @IsArray()
    @IsIn(OPERATING_EXPENSES, { each: true, message: `Possible categorias_variables values are ${OPERATING_EXPENSES.join(', ')}` })
    @IsOptional()
    public categorias_variables?: MovementCategory[];
}
