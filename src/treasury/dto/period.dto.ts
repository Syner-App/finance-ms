import { IsMongoId, IsOptional } from 'class-validator';
import { IsPeriod } from '../../common/dtos/validators.ts';

export class PeriodDto {
    @IsMongoId()
    public organization_id: string;

    // Defaults to the current period
    @IsPeriod()
    @IsOptional()
    public periodo?: string;
}
