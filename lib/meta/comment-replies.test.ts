import { decodeCommentReplies, DEFAULT_COMMENT_REPLIES, expandCommentReply, matchCommentReply, normalizeArabic, pickVariant, replyVariants, type CommentReply } from "./comment-replies";
import type { InboxProduct } from "./inbox-tools";

const product: InboxProduct = { id: "p", name: "مسدس تنظيف", slug: "gun", image: null, price: 25, shippingPrice: 5, available: 0, url: "https://shop.test/ar/landing/gun" };
const reply = (patch: Partial<CommentReply>): CommentReply => ({ id: "r", label: "r", keywords: [], publicText: "", privateText: "", ...patch });

it("normalizes the spellings customers type", () => {
  expect(normalizeArabic("السِّعـــر بكَم؟")).toBe("السعر بكم؟");
  expect(normalizeArabic("أريد إسعار آلة")).toBe("اريد اسعار اله");
  expect(normalizeArabic("التوصیل کم")).toBe(normalizeArabic("التوصيل كم"));
  expect(normalizeArabic("قطعة على")).toBe("قطعه علي");
  expect(normalizeArabic("٢٥ ألف")).toBe("25 الف");
});

it("matches the first reply whose keyword appears", () => {
  const replies = [reply({ id: "price", keywords: ["سعر", "بكم"] }), reply({ id: "thanks", keywords: ["شكرا"] })];
  expect(matchCommentReply("شكد السعر حبيبي", replies)?.id).toBe("price");
  expect(matchCommentReply("بكَم", replies)?.id).toBe("price");
  expect(matchCommentReply("شكراً", replies)?.id).toBe("thanks");
  expect(matchCommentReply("👍", replies)).toBeNull();
  expect(matchCommentReply("اي شي", [reply({ keywords: ["", "  "] })])).toBeNull();
});

it("splits variants on --- lines and rotates them", () => {
  const text = "أول\n---\nثاني\n  ---  \nثالث";
  expect(replyVariants(text)).toEqual(["أول", "ثاني", "ثالث"]);
  expect([0, 1, 2, 3].map(i => pickVariant(text, i))).toEqual(["أول", "ثاني", "ثالث", "أول"]);
  expect(pickVariant("نص واحد", 7)).toBe("نص واحد");
  expect(pickVariant("", 0)).toBe("");
});

it("fills product details and never tells the customer it is out of stock", () => {
  const out = expandCommentReply(reply({ publicText: "{الاسم}: {التوفر}", privateText: "{المنتج} {السعر} {التوصيل} {الرابط}" }), "علي", product);
  expect(out.missing).toEqual([]);
  expect(out.publicText).toBe("علي: متوفر حالياً");
  expect(out.privateText).toContain("مسدس تنظيف");
  expect(out.privateText).toContain(product.url);
});

it("reports the fields that still need a product", () => {
  expect(expandCommentReply(reply({ publicText: "مرحبا {الاسم}", privateText: "{السعر}" }), "علي", null).missing).toEqual(["السعر"]);
});

it("keeps valid saved replies and falls back to defaults on bad storage", () => {
  const saved = [reply({ id: "x", label: "زر", keywords: ["سعر"], publicText: "رد" })];
  expect(decodeCommentReplies(JSON.stringify(saved))).toEqual(saved);
  expect(decodeCommentReplies("{bad")).toEqual(DEFAULT_COMMENT_REPLIES);
  expect(decodeCommentReplies(JSON.stringify([{ id: 1 }]))).toEqual(DEFAULT_COMMENT_REPLIES);
});
