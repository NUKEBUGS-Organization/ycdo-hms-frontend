import { Transform } from 'class-transformer';
import { Allow, IsUUID } from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateReservationDto {
  @IsUUID()
  cartId!: string;

  @IsUUID()
  itemId!: string;

  @Allow()
  @Transform(({ value }) => new Prisma.Decimal(value))
  quantity!: Prisma.Decimal;
}
