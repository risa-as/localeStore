import { prisma } from "@/db/prisma";
import { reconcileConversation, type ConversationReceipt } from "./inbox-state";
import type { InboxContext, InboxPage } from "./inbox";

type Scope = Pick<InboxContext, "pageId" | "platform">;
const key = (ctx: Scope, conversationId: string) => ({ pageId: ctx.pageId, platform: ctx.platform, conversationId });

export async function applyInboxReceipts(ctx: Scope, page: InboxPage): Promise<InboxPage> {
  if (!page.items.length) return page;
  const rows = await prisma.socialInboxState.findMany({ where: { pageId: ctx.pageId, platform: ctx.platform,
    conversationId: { in: page.items.map(item => item.id) } } });
  const receipts = new Map(rows.map(row => [row.conversationId, {
    readMessageId: row.lastReadMessageId || undefined,
    previousMessageIds: row.previousMessageIds,
    reply: row.lastReplyMessageId && row.lastReplyAt ? { id: row.lastReplyMessageId, handle: "", title: "الصفحة",
      text: row.lastReplyText || "", time: row.lastReplyAt.toISOString(), outgoing: true } : undefined,
  } satisfies ConversationReceipt]));
  return { ...page, items: page.items.map(item => reconcileConversation(item, receipts.get(item.id))) };
}

export async function saveInboxRead(ctx: Scope, conversationId: string, messageId: string) {
  const scope = key(ctx, conversationId);
  await prisma.socialInboxState.upsert({ where: { pageId_platform_conversationId: scope },
    create: { ...scope, lastReadMessageId: messageId }, update: { lastReadMessageId: messageId } });
}

export async function saveInboxReply(ctx: Scope, conversationId: string, reply: { id: string; previousMessageIds: string[] }, text: string) {
  const scope = key(ctx, conversationId);
  const data = { lastReadMessageId: reply.id, lastReplyMessageId: reply.id, lastReplyText: text,
    lastReplyAt: new Date(), previousMessageIds: reply.previousMessageIds };
  await prisma.socialInboxState.upsert({ where: { pageId_platform_conversationId: scope },
    create: { ...scope, ...data }, update: data });
}
