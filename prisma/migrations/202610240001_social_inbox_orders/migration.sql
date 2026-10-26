CREATE TABLE "SocialInboxOrder" (
  "requestKey" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "orderId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialInboxOrder_pkey" PRIMARY KEY ("requestKey"),
  CONSTRAINT "SocialInboxOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SocialInboxOrder_pageId_platform_conversationId_createdAt_idx" ON "SocialInboxOrder"("pageId", "platform", "conversationId", "createdAt");
