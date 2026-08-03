import { IsString, IsUUID, MinLength } from 'class-validator';

export class ApplyRefundFlagDto {
  /** Org authoriser id (finance/coordinator) — not a branch user. */
  @IsUUID()
  flaggedBy!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
