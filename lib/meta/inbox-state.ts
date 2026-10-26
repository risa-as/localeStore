import type { InboxItem } from "./inbox";

export type ConversationReceipt = {
  readMessageId?: string;
  reply?: InboxItem;
  // IDs visible before sending. Only these may be superseded by the confirmed reply.
  previousMessageIds?: string[];
};

/** Meta's conversation summary can lag its successful Send API response. */
export function reconcileConversation(item: InboxItem, receipt?: ConversationReceipt): InboxItem {
  if (!receipt) return item;
  const previous = !!item.lastMessageId && !!receipt.previousMessageIds?.includes(item.lastMessageId);
  const confirmed = item.lastMessageId === receipt.reply?.id;
  const read = !!item.lastMessageId && (item.lastMessageId === receipt.readMessageId ||
    ((previous || confirmed) && !!receipt.readMessageId &&
      (receipt.readMessageId === receipt.reply?.id || !!receipt.previousMessageIds?.includes(receipt.readMessageId))));
  const effective = receipt.reply && (previous || confirmed) ? {
    ...item, text: receipt.reply.text || (receipt.reply.attachments?.[0]?.kind === "video" ? "فيديو" : receipt.reply.attachments?.length ? "صورة" : ""), time: receipt.reply.time, outgoing: true,
    lastMessageId: receipt.reply.id,
    system: undefined, commentUrl: undefined,
  } : item;
  return read ? { ...effective, unread: 0 } : effective;
}
