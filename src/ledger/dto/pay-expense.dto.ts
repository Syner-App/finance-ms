import { IsMongoId, IsOptional, IsUUID } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

export class PayExpenseDto {
    @IsMongoId()
    public organization_id: string;

    @IsUUID()
    public id: string;

    @IsCashAccount()
    public cuenta: Account;

    @IsDay()
    @IsOptional()
    public fecha?: string;
}
