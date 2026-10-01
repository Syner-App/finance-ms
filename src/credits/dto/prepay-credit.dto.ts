import { IsMongoId, IsOptional, IsUUID } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

// Extraordinary payment to the principal
export class PrepayCreditDto {
    @IsMongoId()
    public organization_id: string;

    @IsUUID()
    public id: string;

    @IsCashAccount()
    public cuenta: Account;

    @IsAmount()
    public monto: number;

    @IsDay()
    @IsOptional()
    public fecha?: string;
}
