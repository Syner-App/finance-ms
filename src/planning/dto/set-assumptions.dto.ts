import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { IsAmount, IsDay, MAX_AMOUNT } from '../../common/dtos/validators.ts';

// A new version of the break-even assumptions, in force from vigente_desde (default today)
export class SetAssumptionsDto {
    @IsMongoId()
    public organization_id: string;

    @IsDay()
    @IsOptional()
    public vigente_desde?: string;

    @IsAmount()
    public precio_promedio: number;

    // Unset: computed from the recipes, weighted by the units sold
    @IsAmount()
    @IsOptional()
    public costo_variable_unitario?: number;

    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    public arriendo: number;

    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    public servicios: number;

    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    public salarios: number;

    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    public otros_fijos: number;

    @IsInt()
    @Min(1)
    @Max(31)
    public dias_operacion: number;

    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    public inversion_inicial: number;
}
