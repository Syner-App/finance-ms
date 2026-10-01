import { IsMongoId, IsOptional, IsUUID } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

export class PayPayableDto {
    @IsMongoId()
    public organization_id: string;

    @IsUUID()
    public id: string;

    // Amount of the bill: it also becomes the reference cost of the supply
    @IsAmount()
    public monto_real: number;

    @IsCashAccount()
    public cuenta: Account;

    @IsDay()
    @IsOptional()
    public fecha?: string;
}
