import { IsMongoId } from 'class-validator';

export class OrganizationDto {
    // Organization of the authenticated caller, set by client-gateway from the verified token
    @IsMongoId()
    public organization_id: string;
}
