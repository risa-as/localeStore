-- CreateTable
CREATE TABLE "ImportSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "alibabaFeePct" DECIMAL(6,3) NOT NULL DEFAULT 2.99,
    "cardFeePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cardFixedUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "opsCostPerUnitKiqd" DECIMAL(14,3) NOT NULL DEFAULT 0.05,
    "defaultDeliveryRatePct" DECIMAL(6,2) NOT NULL DEFAULT 80,
    "defaultCpaUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "targetMarginPct" DECIMAL(6,2) NOT NULL DEFAULT 25,
    "historyWindowDays" INTEGER NOT NULL DEFAULT 240,
    "minHistoryOrders" INTEGER NOT NULL DEFAULT 20,
    "reorderCoverDays" INTEGER NOT NULL DEFAULT 60,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportCandidate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'new',
    "status" TEXT NOT NULL DEFAULT 'idea',
    "productId" UUID,
    "supplierName" TEXT,
    "supplierUrl" TEXT,
    "notes" TEXT,
    "quantity" INTEGER NOT NULL,
    "moq" INTEGER,
    "unitPriceUsd" DECIMAL(12,4) NOT NULL,
    "intlShippingUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "alibabaFeePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cardFeePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "cardFixedUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fxRate" DECIMAL(12,4) NOT NULL,
    "customsKiqd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "oneOffKiqd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "opsCostPerUnitKiqd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "sellingPriceKiqd" DECIMAL(14,3) NOT NULL,
    "netDeliveryPerOrderKiqd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitsPerOrder" DECIMAL(8,3) NOT NULL DEFAULT 1,
    "cpaUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deliveryRatePct" DECIMAL(6,2) NOT NULL DEFAULT 80,
    "leadTimeDays" INTEGER,
    "snapshot" JSONB,
    "snapshotAt" TIMESTAMP(3),
    "receivedQty" INTEGER,
    "actualIntlShippingUsd" DECIMAL(12,2),
    "actualCustomsKiqd" DECIMAL(14,3),
    "actualFxRate" DECIMAL(12,4),
    "actualLandedKiqd" DECIMAL(14,3),
    "batchId" UUID,
    "convertedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportCandidate_batchId_key" ON "ImportCandidate"("batchId");

-- CreateIndex
CREATE INDEX "ImportCandidate_status_idx" ON "ImportCandidate"("status");

-- CreateIndex
CREATE INDEX "ImportCandidate_productId_idx" ON "ImportCandidate"("productId");

-- AddForeignKey
ALTER TABLE "ImportCandidate" ADD CONSTRAINT "ImportCandidate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCandidate" ADD CONSTRAINT "ImportCandidate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

