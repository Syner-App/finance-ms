import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

// Money the owners put into the business
export class RegisterContributionDto {
    @IsMongoId()
    public organization_id: string;

    @IsAmount()
    public monto: number;

    @IsCashAccount()
    public cuenta: Account;

    @IsDay()
    @IsOptional()
    public fecha?: string;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    public descripcion?: string;
}
