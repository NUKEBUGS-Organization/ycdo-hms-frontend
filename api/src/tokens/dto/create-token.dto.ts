import { PatientCategory, Prisma } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreatePatientDto } from '../../patients/dto/create-patient.dto';

export class TokenLineDto {
  @IsUUID()
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  dose!: number;

  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value ?? 0))
  feed!: Prisma.Decimal;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  days!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  fixDose!: number;
}

export class ReceivableDto {
  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  recommendedBy?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  promisedDate?: Date;
}

export class CreateTokenDto {
  @IsUUID()
  cartId!: string;

  @ValidateIf((o: CreateTokenDto) => !o.newPatient)
  @IsUUID()
  patientId?: string;

  @ValidateIf((o: CreateTokenDto) => !o.patientId)
  @ValidateNested()
  @Type(() => CreatePatientDto)
  newPatient?: CreatePatientDto;

  @IsUUID()
  doctorId!: string;

  @IsEnum(PatientCategory)
  category!: PatientCategory;

  @IsOptional()
  @IsUUID()
  previousTokenId?: string;

  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value))
  amountReceived!: Prisma.Decimal;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TokenLineDto)
  lines!: TokenLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReceivableDto)
  receivable?: ReceivableDto;
}
