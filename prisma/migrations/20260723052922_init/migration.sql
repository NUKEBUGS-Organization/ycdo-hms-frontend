-- CreateEnum
CREATE TYPE "PatientCategory" AS ENUM ('DESERVING', 'POOR', 'MEMBER', 'GENERAL');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('ACTIVE', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('RECEIPT', 'SALE', 'SALE_RETURN', 'RETURN_TO_STORE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('ISSUED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'SETTLED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "designation" TEXT,
    "isDoctor" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tracksStock" BOOLEAN NOT NULL DEFAULT true,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "tracksStock" BOOLEAN NOT NULL DEFAULT true,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "priceDeserving" DECIMAL(12,2) NOT NULL,
    "pricePoor" DECIMAL(12,2) NOT NULL,
    "priceMember" DECIMAL(12,2) NOT NULL,
    "priceGeneral" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "mrNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE,
    "ageYears" INTEGER,
    "phone" TEXT,
    "cnic" VARCHAR(15),
    "address" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "linkedPatientId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_counters" (
    "branchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "lastNo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "token_counters_pkey" PRIMARY KEY ("branchId","date")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tokenNo" INTEGER NOT NULL,
    "tokenDate" DATE NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "category" "PatientCategory" NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountReceived" DECIMAL(12,2) NOT NULL,
    "previousTokenId" UUID,
    "status" "TokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_lines" (
    "id" UUID NOT NULL,
    "tokenId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "dose" INTEGER NOT NULL DEFAULT 0,
    "feed" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 0,
    "fixDose" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "purchasePrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "token_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_returns" (
    "id" UUID NOT NULL,
    "tokenId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" UUID NOT NULL,
    "amountRefunded" DECIMAL(12,2) NOT NULL,
    "restockedToBranch" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "token_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tokenId" UUID NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "recommendedBy" TEXT,
    "promisedDate" DATE,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_stock" (
    "branchId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minLimit" INTEGER NOT NULL DEFAULT 0,
    "maxLimit" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_stock_pkey" PRIMARY KEY ("branchId","itemId")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "delta" DECIMAL(12,2) NOT NULL,
    "reason" "MovementReason" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "transferNo" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "issuedBy" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "receivedBy" UUID,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_lines" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "issuedQuantity" DECIMAL(12,2) NOT NULL,
    "receivedQuantity" DECIMAL(12,2),
    "varianceNote" TEXT,

    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_barcode_idx" ON "items"("barcode");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "patients_cnic_idx" ON "patients"("cnic");

-- CreateIndex
CREATE INDEX "patients_name_idx" ON "patients"("name");

-- CreateIndex
CREATE INDEX "patients_syncedAt_idx" ON "patients"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "patients_branchId_mrNo_key" ON "patients"("branchId", "mrNo");

-- CreateIndex
CREATE INDEX "tokens_branchId_createdAt_idx" ON "tokens"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "tokens_patientId_idx" ON "tokens"("patientId");

-- CreateIndex
CREATE INDEX "tokens_syncedAt_idx" ON "tokens"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_branchId_tokenDate_tokenNo_key" ON "tokens"("branchId", "tokenDate", "tokenNo");

-- CreateIndex
CREATE INDEX "token_lines_tokenId_idx" ON "token_lines"("tokenId");

-- CreateIndex
CREATE INDEX "token_lines_itemId_idx" ON "token_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "token_returns_tokenId_key" ON "token_returns"("tokenId");

-- CreateIndex
CREATE INDEX "token_returns_syncedAt_idx" ON "token_returns"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_tokenId_key" ON "receivables"("tokenId");

-- CreateIndex
CREATE INDEX "receivables_branchId_status_idx" ON "receivables"("branchId", "status");

-- CreateIndex
CREATE INDEX "receivables_syncedAt_idx" ON "receivables"("syncedAt");

-- CreateIndex
CREATE INDEX "stock_movements_branchId_itemId_createdAt_idx" ON "stock_movements"("branchId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_refType_refId_idx" ON "stock_movements"("refType", "refId");

-- CreateIndex
CREATE INDEX "stock_movements_syncedAt_idx" ON "stock_movements"("syncedAt");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfers_syncedAt_idx" ON "transfers"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_branchId_transferNo_key" ON "transfers"("branchId", "transferNo");

-- CreateIndex
CREATE INDEX "transfer_lines_transferId_idx" ON "transfer_lines"("transferId");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_counters" ADD CONSTRAINT "token_counters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_lines" ADD CONSTRAINT "token_lines_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_lines" ADD CONSTRAINT "token_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_returns" ADD CONSTRAINT "token_returns_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
