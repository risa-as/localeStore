CREATE TABLE "SocialInboxPeerReceipt" (
  "pageId" TEXT NOT NULL, "platform" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
  "deliveredThrough" TIMESTAMP(3), "readThrough" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialInboxPeerReceipt_pkey" PRIMARY KEY ("pageId", "platform", "recipientId")
);
CREATE TABLE "SocialInboxMessageReceipt" (
  "pageId" TEXT NOT NULL, "platform" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "messageId" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3), "readAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialInboxMessageReceipt_pkey" PRIMARY KEY ("pageId", "platform", "recipientId", "messageId")
);
