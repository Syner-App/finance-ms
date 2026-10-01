import { IsMongoId, IsUUID } from 'class-validator';

export class SaleByIdDto {
    @IsMongoId()
    public organization_id: string;

    @IsUUID()
    public id: string;
}
