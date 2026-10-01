import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsPeriod } from '../../common/dtos/validators.ts';

export class ReopenPeriodDto {
    @IsMongoId()
    public organization_id: string;

    @IsPeriod()
    public periodo: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    public motivo: string;
}
