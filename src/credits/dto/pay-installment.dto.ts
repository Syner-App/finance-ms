import { IsInt, IsMongoId, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay, MAX_AMOUNT } from '../../common/dtos/validators.ts';

export class PayInstallmentDto {
    @IsMongoId()
    public organization_id: string;

    @IsUUID()
    public id: string;

    @IsCashAccount()
    public cuenta: Account;

    @IsAmount()
    public monto: number;

    // Part of the installment that reduces the principal (the rest is interest)
    @IsInt()
    @Min(0)
    @Max(MAX_AMOUNT)
    @IsOptional()
    public abono_capital?: number;

    @IsDay()
    @IsOptional()
    public fecha?: string;
}
