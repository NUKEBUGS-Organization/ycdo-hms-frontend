import { PatientCategory, Prisma } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ReceivableDto } from './create-token.dto';

export class LabTokenLineDto {
  @IsUUID()
  itemId!: string;

  /** Lab tests have no dose/feed/days — quantity only. */
  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value))
  quantity!: Prisma.Decimal;
}

/** Lab order — existing patient only; always chained from a prior token. */
export class CreateLabTokenDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  doctorId!: string;

  @IsEnum(PatientCategory)
  category!: PatientCategory;

  /** Registration token (or earlier token from the same visit chain). Required. */
  @IsUUID()
  previousTokenId!: string;

  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value))
  amountReceived!: Prisma.Decimal;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LabTokenLineDto)
  lines!: LabTokenLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReceivableDto)
  receivable?: ReceivableDto;
}
