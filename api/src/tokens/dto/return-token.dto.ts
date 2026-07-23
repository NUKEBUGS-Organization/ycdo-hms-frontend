import { Transform } from 'class-transformer';
import { Allow, IsBoolean, IsString, IsUUID, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';

export class ReturnTokenDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsUUID()
  approvedBy!: string;

  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value))
  amountRefunded!: Prisma.Decimal;

  @IsBoolean()
  restockToBranch!: boolean;
}
