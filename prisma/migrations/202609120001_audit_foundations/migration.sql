-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "relatedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "inventoryDispatchedAt" TIMESTAMP(3),
ADD COLUMN     "inventoryReturnedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "returnReasonCode" TEXT,
ADD COLUMN     "returnReasonText" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "costSource" TEXT,
ADD COLUMN     "costTotal" DECIMAL(12,2),
ADD COLUMN     "lineTotal" DECIMAL(12,2),
ADD COLUMN     "offersSnapshot" TEXT;

-- AlterTable
ALTER TABLE "ShippingSettings" ALTER COLUMN "baghdadCost" SET DEFAULT 4,
ALTER COLUMN "othersCost" SET DEFAULT 5;

-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "WaMessage" ADD COLUMN     "buttonPayload" TEXT,
ADD COLUMN     "orderId" UUID,
ADD COLUMN     "replyToMessageId" TEXT;

-- CreateTable
CREATE TABLE "InventoryAllocation" (
    "source" TEXT NOT NULL DEFAULT 'dispatch',
    "id" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageOutbox" (
    "id" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "waMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreEvent" (
    "eventKey" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderId" UUID,
    "productId" UUID,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryAllocation_orderId_productId_idx" ON "InventoryAllocation"("orderId", "productId");

-- CreateIndex
CREATE INDEX "InventoryAllocation_batchId_idx" ON "InventoryAllocation"("batchId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageOutbox_eventKey_key" ON "MessageOutbox"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "MessageOutbox_waMessageId_key" ON "MessageOutbox"("waMessageId");

-- CreateIndex
CREATE INDEX "MessageOutbox_status_nextAttemptAt_idx" ON "MessageOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreEvent_eventKey_key" ON "StoreEvent"("eventKey");

-- CreateIndex
CREATE INDEX "StoreEvent_name_createdAt_idx" ON "StoreEvent"("name", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageOutbox" ADD CONSTRAINT "MessageOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

