-- AlterEnum
ALTER TYPE "TokenStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN "refundFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tokens" ADD COLUMN "refundFlaggedBy" UUID;
ALTER TABLE "tokens" ADD COLUMN "refundFlaggedAt" TIMESTAMP(3);
ALTER TABLE "tokens" ADD COLUMN "refundReason" TEXT;
