import { ArrayMaxSize, IsArray, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class ScenariosDto {
    @IsMongoId()
    public organization_id: string;

    // Granizados per day; empty uses the policy levels
    @IsArray()
    @ArrayMaxSize(10)
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(100_000, { each: true })
    @IsOptional()
    public niveles?: number[];
}
