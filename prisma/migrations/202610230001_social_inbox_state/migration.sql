CREATE TABLE "SocialInboxState" (
    "pageId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReplyMessageId" TEXT,
    "lastReplyText" TEXT,
    "lastReplyAt" TIMESTAMP(3),
    "previousMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialInboxState_pkey" PRIMARY KEY ("pageId", "platform", "conversationId")
);
