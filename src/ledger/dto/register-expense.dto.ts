import { IsBoolean, IsIn, IsMongoId, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Account, MovementCategory } from '../../generated/prisma/enums.ts';
import { IsAmount, IsCashAccount, IsDay } from '../../common/dtos/validators.ts';
import { OPERATING_EXPENSES } from '../../common/categories.ts';

export class RegisterExpenseDto {
    // Organization of the authenticated caller, set by client-gateway from the verified token
    @IsMongoId()
    public organization_id: string;

    // Only operating expenses: withdrawals, installments and transfers have their own RPCs
    @IsIn(OPERATING_EXPENSES, { message: `Possible categoria values are ${OPERATING_EXPENSES.join(', ')}` })
    public categoria: MovementCategory;

    @IsAmount()
    public monto: number;

    // Accrual date (defaults to today); it decides the period
    @IsDay()
    @IsOptional()
    public fecha?: string;

    // false (default): accrued but not paid yet (PENDIENTE)
    @IsBoolean()
    @IsOptional()
    public pagado?: boolean;

    @ValidateIf((dto: RegisterExpenseDto) => dto.pagado === true)
    @IsCashAccount()
    public cuenta?: Account;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    public descripcion?: string;
}
