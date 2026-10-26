import type { InboxItem } from "./inbox";

export type QuickReply = { id: string; shortcut: string; title: string; text: string };
export type InboxProduct = { id: string; name: string; slug: string; image: string | null; price: number; shippingPrice: number; available: number; url: string; colors?: string[]; offers?: string | null };
export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: "greeting", shortcut: "سلام", title: "رد السلام", text: "وعليكم السلام ورحمة الله وبركاته 🌷" },
  { id: "hello", shortcut: "ترحيب", title: "ترحيب", text: "أهلاً {الاسم}، نورتنا 🌷 شلون نكدر نساعدك؟" },
  { id: "price", shortcut: "سعر", title: "سعر المنتج", text: "أهلاً {الاسم}، سعر {المنتج} هو {السعر}، والتوصيل {التوصيل}.\nتفاصيل المنتج: {الرابط}" },
  { id: "stock", shortcut: "توفر", title: "توفر المنتج", text: "{المنتج}: {التوفر}.\nتگدر تشوف التفاصيل وتطلب من هنا: {الرابط}" },
  { id: "order", shortcut: "طلب", title: "معلومات الطلب", text: "لتسجيل طلبك، أرسل لنا الاسم ورقم الهاتف والمحافظة والعنوان بالتفصيل بالرسائل الخاصة 🌷" },
];
const PRODUCT_FIELDS = new Set(["المنتج", "السعر", "التوصيل", "التوفر", "الرابط"]);
export function quickReplyProductFields(text: string) {
  return [...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1].trim()).filter(key => PRODUCT_FIELDS.has(key)))];
}
export function groupQuickReplies(replies: QuickReply[]) {
  return { general: replies.filter(reply => !quickReplyProductFields(reply.text).length),
    product: replies.filter(reply => quickReplyProductFields(reply.text).length) };
}
export function decodeQuickReplies(raw: string | null): QuickReply[] {
  try {
    const saved: unknown = JSON.parse(raw || "null");
    if (Array.isArray(saved) && saved.length <= 50 && saved.every(item => item && typeof item.id === "string" &&
      typeof item.title === "string" && typeof item.shortcut === "string" && typeof item.text === "string" && item.text.length <= 1000)) return saved;
  } catch { /* Retain defaults for malformed or unavailable browser storage. */ }
  return [...DEFAULT_QUICK_REPLIES];
}
export const GENERAL_QUICK_REPLIES = groupQuickReplies(DEFAULT_QUICK_REPLIES).general;
// Product prices in this store are stored in thousands of Iraqi dinars.
export const money = (value: number) => `${new Intl.NumberFormat("ar-IQ").format(Math.round(value * 1000))} د.ع`;
export function expandQuickReply(text: string, name: string, product?: InboxProduct | null) {
  const values: Record<string, string | undefined> = { الاسم: name || "بيك", المنتج: product?.name,
    السعر: product ? money(product.price) : undefined, الرابط: product?.url,
    التوصيل: product ? product.shippingPrice === 0 ? "مجاني" : money(product.shippingPrice) : undefined,
    التوفر: product ? product.available > 0 ? "متوفر حالياً" : "غير متوفر حالياً" : undefined };
  const missing: string[] = [];
  const expanded = text.replace(/\{([^{}]+)\}/g, (token, key: string) => {
    key = key.trim();
    if (values[key] === undefined) { missing.push(key); return token; }
    return values[key]!;
  });
  return { text: expanded, missing: [...new Set(missing)] };
}
export function nextAwaiting(items: InboxItem[], currentId: string, handled: ReadonlySet<string> = new Set(), replySince?: number) {
  return items.filter(item => item.id !== currentId && !handled.has(item.id) && !item.system && item.outgoing === false &&
    (replySince === undefined || Date.parse(item.time) > replySince))
    .sort((a, b) => (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0))[0] || null;
}
