import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { MovementCategory, StatusMovement } from '../../generated/prisma/enums.ts';
import { PaginationDto } from '../../common/dtos/pagination.dto.ts';
import { IsPeriod } from '../../common/dtos/validators.ts';

export class FindMovementsDto extends PaginationDto {
    @IsMongoId()
    public organization_id: string;

    @IsPeriod()
    @IsOptional()
    public periodo?: string;

    @IsEnum(MovementCategory, { message: `Possible categoria values are ${Object.values(MovementCategory).join(', ')}` })
    @IsOptional()
    public categoria?: MovementCategory;

    @IsEnum(StatusMovement, { message: `Possible estado values are ${Object.values(StatusMovement).join(', ')}` })
    @IsOptional()
    public estado?: StatusMovement;
}
