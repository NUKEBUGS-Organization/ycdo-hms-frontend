-- Per-branch pricing + registration fees (Prompt 4A).
-- No backfill: DBs were seed-only; re-seed after migrate.

CREATE TABLE "branch_item_prices" (
    "branchId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "priceDeserving" DECIMAL(12,2) NOT NULL,
    "pricePoor" DECIMAL(12,2) NOT NULL,
    "priceMember" DECIMAL(12,2) NOT NULL,
    "priceGeneral" DECIMAL(12,2) NOT NULL,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_item_prices_pkey" PRIMARY KEY ("branchId","itemId")
);

CREATE TABLE "registration_fees" (
    "branchId" UUID NOT NULL,
    "category" "PatientCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_fees_pkey" PRIMARY KEY ("branchId","category")
);

ALTER TABLE "branch_item_prices" ADD CONSTRAINT "branch_item_prices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_item_prices" ADD CONSTRAINT "branch_item_prices_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registration_fees" ADD CONSTRAINT "registration_fees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "items" DROP COLUMN "purchasePrice",
DROP COLUMN "priceDeserving",
DROP COLUMN "pricePoor",
DROP COLUMN "priceMember",
DROP COLUMN "priceGeneral";
