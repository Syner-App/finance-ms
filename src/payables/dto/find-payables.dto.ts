import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { StatusPayable } from '../../generated/prisma/enums.ts';
import { PaginationDto } from '../../common/dtos/pagination.dto.ts';

export class FindPayablesDto extends PaginationDto {
    @IsMongoId()
    public organization_id: string;

    @IsEnum(StatusPayable, { message: `Possible estado values are ${Object.values(StatusPayable).join(', ')}` })
    @IsOptional()
    public estado?: StatusPayable;
}
