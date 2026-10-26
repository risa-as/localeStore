import type { Prisma } from "@prisma/client";

// Both the follow-up summary and inbox count conversations, not individual messages.
export const WA_UNREAD_CONVERSATIONS = { unreadCount: { gt: 0 } } satisfies Prisma.WaConversationWhereInput;
export type WaConversationFilter = "all" | "unread" | "open" | "closed";

export function waConversationFilter(value?: string): WaConversationFilter {
  return value === "unread" || value === "open" || value === "closed" ? value : "all";
}

export function waConversationStatusWhere(filter: WaConversationFilter, now: Date): Prisma.WaConversationWhereInput {
  if (filter === "unread") return WA_UNREAD_CONVERSATIONS;
  if (filter === "open") return { windowExpiresAt: { gt: now } };
  if (filter === "closed") return { OR: [{ windowExpiresAt: null }, { windowExpiresAt: { lte: now } }] };
  return {};
}
