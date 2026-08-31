import {
  computeItemsPriceTotal,
  computeOrderPricing,
  parseTwoPieceOfferPrice,
} from "./pricing";

// نصوص العروض الحقيقية كما هي في قاعدة البيانات — أي تغيير في صياغة المشرف
// يجب أن يظل مفهوماً للمحلّل، لذلك تُختبر النصوص الفعلية لا نماذج مبسطة.
const REAL_OFFERS: [string, string, number][] = [
  ["كتر مع فاحص احترافي", "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب47 الف و 5 توصيل", 47],
  ["كاوية لحيم", "سعر القطعة ب27 الف و3 توصيل , سعر القطعتين ب47 الف و 3 توصيل", 47],
  ["تحويلة حنفية", "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب50 الف و5 توصيل", 50],
  ["وسادة طبية", "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب50 الف و5 توصيل", 50],
  ["خلاط مطبخ", "سعر القطعة ب37 الف و5 توصيل , سعر القطعتين ب65 الف و5 توصيل", 65],
  ["مسند ذراع", "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب50 الف و5 توصيل", 50],
  ["موزع اكواب", "سعر القطعة ب17 الف و3 توصيل , سعر القطعتين ب30 الف و3 توصيل", 30],
  ["صندوق الخياطة", "سعر القطعة ب17 الف و 3 الاف التوصيل , سعر القطعتين ب30 الف و3 الاف التوصيل ", 30],
  ["كابسة شد", "سعر القطعة ب22 الف و3 الاف التوصيل , سعر القطعتين ب37 الف و3 الاف التوصيل", 37],
  ["مشد ركبة", "سعر القطعة ب25 الف والتوصيل مجاني , سعر القطعتين ب45 الف والتوصيل ", 45],
  ["مكنسة تنظيف", "سعر القطعة ب92 الف و 3 توصيل , سعر القطعتين ب177 الف و 3 توصيل", 177],
];

describe("parseTwoPieceOfferPrice", () => {
  it.each(REAL_OFFERS)("reads the two-piece price for %s", (_name, offers, expected) => {
    expect(parseTwoPieceOfferPrice(offers)).toBe(expected);
  });

  it("never returns the single-piece price by mistake", () => {
    // "القطعة" تسبق "القطعتين" — البحث عن أول رقم في النص يعطي 27 خطأً
    expect(parseTwoPieceOfferPrice("سعر القطعة ب27 الف , سعر القطعتين ب47 الف")).toBe(47);
  });

  it("handles Arabic-Indic numerals", () => {
    expect(parseTwoPieceOfferPrice("سعر القطعتين ب٤٧ الف")).toBe(47);
  });

  it("accepts decimals", () => {
    expect(parseTwoPieceOfferPrice("سعر القطعتين ب47.5 الف")).toBe(47.5);
  });

  it("returns null when there is no two-piece offer", () => {
    expect(parseTwoPieceOfferPrice("سعر القطعة ب27 الف")).toBeNull();
    expect(parseTwoPieceOfferPrice("")).toBeNull();
    expect(parseTwoPieceOfferPrice(null)).toBeNull();
    expect(parseTwoPieceOfferPrice("سعر القطعتين حسب الطلب")).toBeNull();
  });
});

describe("computeOrderPricing", () => {
  const ktr = {
    unitPrice: 27,
    shippingPrice: 5,
    offers: "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب47 الف و 5 توصيل",
  };

  it("charges the plain unit price for a single piece", () => {
    expect(computeOrderPricing({ ...ktr, quantity: 1 })).toEqual({
      itemsPrice: 27,
      shippingPrice: 5,
      totalPrice: 32,
      source: "single",
    });
  });

  it("uses the offer price for two pieces instead of 2 × unit price", () => {
    const result = computeOrderPricing({ ...ktr, quantity: 2 });
    expect(result.itemsPrice).toBe(47);
    expect(result.totalPrice).toBe(52);
    expect(result.source).toBe("offer");
  });

  it("adds the offer step for each piece beyond two", () => {
    expect(computeOrderPricing({ ...ktr, quantity: 3 }).itemsPrice).toBe(67);
    expect(computeOrderPricing({ ...ktr, quantity: 4 }).itemsPrice).toBe(87);
    expect(computeOrderPricing({ ...ktr, quantity: 5 }).itemsPrice).toBe(107);
  });

  it("keeps shipping flat regardless of quantity", () => {
    for (const quantity of [1, 2, 3, 10]) {
      expect(computeOrderPricing({ ...ktr, quantity }).shippingPrice).toBe(5);
    }
  });

  it("falls back to unit × quantity when the product has no offer", () => {
    const result = computeOrderPricing({
      quantity: 2,
      unitPrice: 27,
      shippingPrice: 5,
      offers: "",
    });
    expect(result.itemsPrice).toBe(54);
    expect(result.source).toBe("fallback");
  });

  it("falls back when the offer price is not above the unit price", () => {
    const result = computeOrderPricing({
      quantity: 2,
      unitPrice: 27,
      shippingPrice: 5,
      offers: "سعر القطعتين ب20 الف",
    });
    expect(result.itemsPrice).toBe(54);
    expect(result.source).toBe("fallback");
  });

  it("handles free shipping", () => {
    const result = computeOrderPricing({
      quantity: 2,
      unitPrice: 25,
      shippingPrice: 0,
      offers: "سعر القطعة ب25 الف والتوصيل مجاني , سعر القطعتين ب45 الف والتوصيل ",
    });
    expect(result).toEqual({
      itemsPrice: 45,
      shippingPrice: 0,
      totalPrice: 45,
      source: "offer",
    });
  });

  it("treats a zero or negative quantity as one piece", () => {
    expect(computeOrderPricing({ ...ktr, quantity: 0 }).itemsPrice).toBe(27);
  });
});

describe("computeItemsPriceTotal", () => {
  const offers = new Map<string, string | null | undefined>([
    ["ktr", "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب47 الف و 5 توصيل"],
    ["khlat", "سعر القطعة ب37 الف و5 توصيل , سعر القطعتين ب65 الف و5 توصيل"],
    ["noOffer", null],
  ]);

  it("prices every product by its own offer", () => {
    const total = computeItemsPriceTotal(
      [
        { productId: "ktr", unitPrice: 27, quantity: 2 }, // 47
        { productId: "khlat", unitPrice: 37, quantity: 1 }, // 37
      ],
      offers,
    );
    expect(total).toBe(84);
  });

  it("falls back per product, not for the whole order", () => {
    const total = computeItemsPriceTotal(
      [
        { productId: "ktr", unitPrice: 27, quantity: 2 }, // 47 من العرض
        { productId: "noOffer", unitPrice: 10, quantity: 3 }, // 30 ضرب بسيط
      ],
      offers,
    );
    expect(total).toBe(77);
  });

  it("returns zero for an empty order", () => {
    expect(computeItemsPriceTotal([], offers)).toBe(0);
  });
});
