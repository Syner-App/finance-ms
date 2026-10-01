import { applyDecorators } from '@nestjs/common';
import { IsIn, IsInt, IsPositive, Matches, Max } from 'class-validator';
import { Account } from '../../generated/prisma/enums.ts';

// Amounts are whole pesos stored in INTEGER columns
export const MAX_AMOUNT = 1_000_000_000;

export const IsAmount = () => applyDecorators(IsInt(), IsPositive(), Max(MAX_AMOUNT));

export const IsDay = () =>
  Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: '$property must be a date (YYYY-MM-DD)' });

export const IsPeriod = () => Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: '$property must be a period (YYYY-MM)' });

// Accounts that hold operating cash (RESERVA is set apart)
export const CASH_ACCOUNTS = [Account.CAJA, Account.BANCO] as const;

export const IsCashAccount = () =>
  IsIn(CASH_ACCOUNTS, { message: `Possible $property values are ${CASH_ACCOUNTS.join(', ')}` });
