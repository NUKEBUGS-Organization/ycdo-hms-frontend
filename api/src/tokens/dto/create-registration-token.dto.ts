import { PatientCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreatePatientDto } from '../../patients/dto/create-patient.dto';

export class CreateRegistrationTokenDto {
  @ValidateIf((o: CreateRegistrationTokenDto) => !o.newPatient)
  @IsUUID()
  patientId?: string;

  @ValidateIf((o: CreateRegistrationTokenDto) => !o.patientId)
  @ValidateNested()
  @Type(() => CreatePatientDto)
  newPatient?: CreatePatientDto;

  @IsUUID()
  doctorId!: string;

  @IsEnum(PatientCategory)
  category!: PatientCategory;
}
