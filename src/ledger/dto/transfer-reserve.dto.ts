import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';

export class TransferReserveDto {
    @IsMongoId()
    public organization_id: string;

    @IsAmount()
    public monto: number;

    // CAJA or BANCO: where the money comes from (or goes to, when leaving the reserve)
    @IsCashAccount()
    public cuenta: Account;

    // true (default): into the reserve; false: back to cuenta
    @IsBoolean()
    @IsOptional()
    public hacia_reserva?: boolean;

    @IsDay()
    @IsOptional()
    public fecha?: string;
}
