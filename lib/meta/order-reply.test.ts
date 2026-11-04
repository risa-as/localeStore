import { fillOrderFields, usesOrderFields } from "./order-reply";
import { DEFAULT_COMMENT_REPLIES, expandCommentReply } from "./comment-replies";

const order = { phoneNumber: "07701234567", governorate: "Basra", address: " الزبير قرب المستوصف ", totalPrice: 22,
  items: [{ name: "مسدس تنظيف", qty: 1 }, { name: "فلتر زيت", qty: 2 }] };

it("fills the confirmation with the saved order", () => {
  const text = fillOrderFields("{منتجات الطلب}\n{مجموع الطلب}\n{العنوان}\n{رقم الهاتف}\n{الاسم}", order);
  expect(text.split("\n")).toEqual(["مسدس تنظيف، فلتر زيت × 2", expect.stringContaining("٢٢٬٠٠٠"), "البصرة - الزبير قرب المستوصف", "07701234567", "{الاسم}"]);
  expect(usesOrderFields("تم الحجز {رقم الهاتف}")).toBe(true);
  expect(usesOrderFields("السعر {السعر}")).toBe(false);
});

it("the default order reply confirms publicly and sends the details privately", () => {
  const reply = DEFAULT_COMMENT_REPLIES.find(item => item.intents.includes("order"))!;
  const expanded = expandCommentReply(reply, "علي", null);
  expect(expanded.missing).toEqual([]);
  expect(expanded.needsOrder).toBe(true);
  expect(expanded.publicText).toContain("تم الحجز");
  expect(expanded.publicText).toContain("24 ساعة");
  expect(expanded.privateText).toContain("{رقم الهاتف}");
  expect(reply.privateRequired).toBe(false);
});

it("price and booking replies carry the product details publicly and privately", () => {
  const product = { id: "p", name: "منشار", slug: "s", image: null, price: 20, shippingPrice: 5, available: 3, url: "https://x.test/p", offers: "قطعتين ب35 الف" };
  for (const id of ["price-public", "booking-how"]) {
    const reply = DEFAULT_COMMENT_REPLIES.find(item => item.id === id)!;
    const expanded = expandCommentReply(reply, "علي", product);
    for (const text of [expanded.publicText, expanded.privateText]) {
      expect(text).toContain("منشار");
      expect(text).toContain("قطعتين ب35 الف");
      expect(text).toMatch(/رقم/);
    }
    expect(reply.privateRequired).toBe(false);
  }
});
