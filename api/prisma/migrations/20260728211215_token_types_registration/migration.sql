-- TokenType + tokenFee (Prompt 4B).
-- Existing tokens were seed/dev pharmacy saves only — wipe rather than silently
-- defaulting tokenType (would hide the migration intent).

DELETE FROM "token_lines";
DELETE FROM "receivables";
DELETE FROM "token_returns";
UPDATE "stock_reservations" SET "tokenId" = NULL WHERE "tokenId" IS NOT NULL;
DELETE FROM "tokens";

CREATE TYPE "TokenType" AS ENUM ('REGISTRATION', 'PHARMACY', 'LAB', 'REFERRAL');

ALTER TABLE "tokens" ADD COLUMN "tokenFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "tokens" ADD COLUMN "tokenType" "TokenType" NOT NULL;
