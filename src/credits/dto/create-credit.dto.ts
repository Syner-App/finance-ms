import { IsInt, IsMongoId, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsAmount, MAX_AMOUNT } from '../../common/dtos/validators.ts';

export class CreateCreditDto {
    @IsMongoId()
    public organization_id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public nombre: string;

    @IsAmount()
    public saldo_capital: number;

    @IsAmount()
    public cuota_mensual: number;

    // Part of the installment paid by the business (the rest is personal)
    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    public cuota_asignada: number;

    @IsInt()
    @Min(1)
    @Max(31)
    public dia_pago: number;
}
