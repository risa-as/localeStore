import { expandQuickReply, nextAwaiting, money, GENERAL_QUICK_REPLIES, quickReplyProductFields, decodeQuickReplies, groupQuickReplies, type InboxProduct } from "./inbox-tools";
import type { InboxItem } from "./inbox";

const product: InboxProduct = { id: "p1", slug: "product", name: "منتج", price: 18, shippingPrice: 4,
  available: 2, image: null, url: "https://store.example/ar/product/product" };
const item = (id: string, time: string, outgoing: boolean): InboxItem => ({ id, time, outgoing, handle: id, title: id, text: "" });

it("uses the saved booking reply's renamed title and edited body in the general reply library", () => {
  const saved = [{ id: "order", title: "تثبيت الطلب", shortcut: "تثبيت", text: "لتثبيت الطلب يرجى إرسال رقم الهاتف والعنوان." }];
  const library = decodeQuickReplies(JSON.stringify(saved));
  const { general } = groupQuickReplies(library);
  expect(general).toEqual(saved);
  expect(expandQuickReply(general[0].text, "عمار").text).toBe(saved[0].text);
  expect(general.some(reply => reply.title === "معلومات الحجز")).toBe(false);
  expect(decodeQuickReplies("[]")).toEqual([]); // Deleted replies must not reappear as fixed defaults.
});
it("classifies new and edited saved replies by their content in both reply locations", () => {
  const general = { id: "custom", title: "الحجز", shortcut: "حجز", text: "أهلاً {الاسم}، أرسل رقم الهاتف والعنوان." };
  const offer = { id: "offer", title: "عرض المنتج", shortcut: "عرض", text: "{المنتج} بسعر {السعر}. {الرابط}" };
  expect(groupQuickReplies(decodeQuickReplies(JSON.stringify([general, offer])))).toEqual({ general: [general], product: [offer] });
  expect(groupQuickReplies([{ ...offer, text: "أهلاً وسهلاً" }]).product).toEqual([]);
});

it.each(GENERAL_QUICK_REPLIES)("allows the general reply '$title' without a product and never inserts selected product details", reply => {
  const withoutProduct = expandQuickReply(reply.text, "عمار");
  expect(quickReplyProductFields(reply.text)).toEqual([]);
  expect(withoutProduct.missing).toEqual([]);
  expect(withoutProduct.text.trim()).not.toBe("");
  expect(expandQuickReply(reply.text, "عمار", product)).toEqual(withoutProduct);
});
it("requires a product only for actual product placeholders, including whitespace, not ordinary booking instructions", () => {
  expect(quickReplyProductFields("للحجز يرجى كتابة رقم الهاتف والعنوان وتحديد المنتج المطلوب")).toEqual([]);
  expect(expandQuickReply("أهلاً { الاسم }", "عمار")).toEqual({ text: "أهلاً عمار", missing: [] });
  expect(quickReplyProductFields("سعر { المنتج } هو {السعر} — {السعر}")).toEqual(["المنتج", "السعر"]);
  expect(quickReplyProductFields("أهلاً {الاسم} {متغيرغيرمعروف}")).toEqual([]);
});

it("formats the store's thousand-dinar prices and does not invent missing product values", () => {
  expect(money(18)).toContain(new Intl.NumberFormat("ar-IQ").format(18000));
  const missing = expandQuickReply("{الاسم} {السعر} {الرابط}", "زبون");
  expect(missing.missing).toEqual(["السعر", "الرابط"]);
  expect(missing.text).toBe("زبون {السعر} {الرابط}");
  expect(expandQuickReply("{السعر} {التوصيل} {الرابط}", "زبون", product)).toEqual({
    text: `${money(18)} ${money(4)} ${product.url}`, missing: [],
  });
  expect(expandQuickReply("{التوصيل} {التوفر}", "زبون", { ...product, available: 0, shippingPrice: 0 }).text)
    .toBe("مجاني غير متوفر حالياً");
});
it("opens the oldest waiting customer, excluding the current, answered and system messages", () => {
  const items = [item("current", "2026-10-01", false), item("recent", "2026-10-23", false),
    item("answered", "2026-10-02", true), { ...item("notice", "2026-10-03", false), system: "comment-origin" as const },
    item("oldest", "2026-10-04", false)];
  expect(nextAwaiting(items, "current")?.id).toBe("oldest");
  expect(nextAwaiting(items, "current", new Set(["oldest"]))?.id).toBe("recent");
  expect(nextAwaiting(items, "current", new Set(["oldest", "recent"]))).toBeNull();
  expect(nextAwaiting(items, "current", new Set(), Date.parse("2026-10-22"))?.id).toBe("recent");
});
