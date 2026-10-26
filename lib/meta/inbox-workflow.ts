import type { InboxItem } from "./inbox";
import { digits } from "./inbox-order";
import { insertOrderSchema } from "@/lib/validators";

export type SelectedOrderFields = Partial<Pick<ReturnType<typeof insertOrderSchema.parse>, "phoneNumber" | "address">>;
export function selectedOrderValue(field: "phoneNumber" | "address", text: string) {
  const value = text.replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (field === "address") {
    if (value.length < 3 || value.length > 1000) throw new Error("حدّد عنواناً من 3 إلى 1000 حرف.");
    return value;
  }
  const phone = digits(value).replace(/[\s()\-]/g, "").replace(/^00964/, "964");
  const result = insertOrderSchema.shape.phoneNumber.safeParse(phone);
  if (!result.success) throw new Error("حدّد رقم هاتف عراقي واحداً كاملاً، مثل 07701234567.");
  return result.data;
}

export function inboxOrderLookupHref(locale: string, order: { id: string; status: string; phoneNumber?: string | null; isArchived?: boolean }, searchedPhone?: string) {
  const direct = `/${locale}/order/${encodeURIComponent(order.id)}`;
  if (order.isArchived) return direct;
  for (const candidate of [order.phoneNumber, searchedPhone]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      const query = candidate.trim();
      // Some imported orders store the ten-digit local number without its zero.
      selectedOrderValue("phoneNumber", /^7\d{9}$/.test(query) ? `0${query}` : query);
      return `/${locale}/admin/orders?${new URLSearchParams({ status: order.status, query }).toString()}`;
    } catch { /* A stale lookup response may omit the per-order phone. Use the searched number. */ }
  }
  return direct;
}

export function inboxPhoneCandidates(items: InboxItem[]): string[] {
  const phones = new Set<string>();
  for (const item of items) {
    if (item.outgoing || item.system) continue;
    const text = digits(item.text).replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "");
    for (const match of text.matchAll(/(?<!\d)(?:\+?964|00964|0)[\s()\-]*7\d(?:[\s()\-]*\d){8}(?!\d)/g)) {
      try { phones.add(selectedOrderValue("phoneNumber", match[0])); } catch { /* Ignore incomplete or unsupported numbers. */ }
    }
  }
  return [...phones];
}

export type CommentGroup = { key: string; items: InboxItem[] };
/** Call with a single post's loaded comments. Names are not unique identities. */
export function groupInboxComments(items: InboxItem[]): CommentGroup[] {
  const groups = new Map<string, CommentGroup>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const identity = item.authorId ? `id:${item.authorId}` : item.authorUsername ? `username:${item.authorUsername.toLowerCase()}` : undefined;
    const key = !item.outgoing && identity ? identity : `comment:${item.id}`;
    const group = groups.get(key);
    if (group) group.items.push(item); else groups.set(key, { key, items: [item] });
  }
  return [...groups.values()];
}
