import { IsBoolean, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

// Owner withdrawal: never an operating expense
export class RegisterWithdrawalDto {
    @IsMongoId()
    public organization_id: string;

    @IsAmount()
    public monto: number;

    @IsCashAccount()
    public cuenta: Account;

    @IsDay()
    @IsOptional()
    public fecha?: string;

    // Who withdraws and what for
    @IsString()
    @MaxLength(255)
    @IsOptional()
    public descripcion?: string;

    // Withdraw above the distributable profit (flagged as descapitalizacion)
    @IsBoolean()
    @IsOptional()
    public forzar?: boolean;

    @ValidateIf((dto: RegisterWithdrawalDto) => dto.forzar === true)
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    public motivo?: string;
}
