import { PatientCategory, Prisma } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

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

/** Pharmacy dispense — existing patient only; always chained from a prior token. */
export class CreateTokenDto {
  @IsUUID()
  cartId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  doctorId!: string;

  @IsEnum(PatientCategory)
  category!: PatientCategory;

  /** Registration token (or earlier pharmacy token on a return visit). Required. */
  @IsUUID()
  previousTokenId!: string;

  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value))
  amountReceived!: Prisma.Decimal;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TokenLineDto)
  lines!: TokenLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReceivableDto)
  receivable?: ReceivableDto;
}
