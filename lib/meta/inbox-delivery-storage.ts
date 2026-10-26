import { prisma } from "@/db/prisma";
import { messageDelivery, type ReceiptEvent } from "./inbox-delivery";
import type { InboxContext, InboxItem } from "./inbox";

// GREATEST makes delayed/repeated callbacks monotonic and safe across workers.
export async function saveInboxReceiptEvent(event: ReceiptEvent) {
  await prisma.$transaction(async tx => {
    if (event.deliveredThrough || event.readThrough) await tx.$executeRaw`
      INSERT INTO "SocialInboxPeerReceipt" ("pageId", "platform", "recipientId", "deliveredThrough", "readThrough", "updatedAt")
      VALUES (${event.pageId}, ${event.platform}, ${event.recipientId}, ${event.deliveredThrough ?? null}, ${event.readThrough ?? null}, NOW())
      ON CONFLICT ("pageId", "platform", "recipientId") DO UPDATE SET
        "deliveredThrough" = GREATEST("SocialInboxPeerReceipt"."deliveredThrough", EXCLUDED."deliveredThrough"),
        "readThrough" = GREATEST("SocialInboxPeerReceipt"."readThrough", EXCLUDED."readThrough"), "updatedAt" = NOW()`;
    for (const mid of new Set([...event.deliveredMids, ...event.readMids])) {
      const readAt = event.readMids.includes(mid) ? event.at : null;
      const deliveredAt = event.deliveredMids.includes(mid) ? event.at : null;
      await tx.$executeRaw`
        INSERT INTO "SocialInboxMessageReceipt" ("pageId", "platform", "recipientId", "messageId", "deliveredAt", "readAt", "updatedAt")
        VALUES (${event.pageId}, ${event.platform}, ${event.recipientId}, ${mid}, ${deliveredAt}, ${readAt}, NOW())
        ON CONFLICT ("pageId", "platform", "recipientId", "messageId") DO UPDATE SET
          "deliveredAt" = GREATEST("SocialInboxMessageReceipt"."deliveredAt", EXCLUDED."deliveredAt"),
          "readAt" = GREATEST("SocialInboxMessageReceipt"."readAt", EXCLUDED."readAt"), "updatedAt" = NOW()`;
    }
  });
}

export async function applyInboxDelivery(ctx: Pick<InboxContext, "pageId" | "platform">, recipientId: string | undefined, items: InboxItem[]): Promise<InboxItem[]> {
  const ids = items.filter(item => item.outgoing).map(item => item.id);
  if (!recipientId || !ids.length) return items;
  const scope = { pageId: ctx.pageId, platform: ctx.platform, recipientId };
  const [peer, messages] = await Promise.all([
    prisma.socialInboxPeerReceipt.findUnique({ where: { pageId_platform_recipientId: scope } }),
    prisma.socialInboxMessageReceipt.findMany({ where: { ...scope, messageId: { in: ids } } }),
  ]);
  const byId = new Map(messages.map(message => [message.messageId, message]));
  return items.map(item => ({ ...item, deliveryStatus: messageDelivery(item, peer, byId.get(item.id)) }));
}
