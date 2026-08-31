/**
 * تسعير الطلب اعتماداً على حقل «العروض» في المنتج.
 *
 * سعر القطعة الواحدة يأتي من `Product.price`، وكلفة التوصيل من
 * `Product.shippingPrice` (ثابتة مهما كانت الكمية). أما سعر القطعتين فيُقرأ من
 * نص العروض الذي يكتبه المشرف، مثل:
 *
 *   "سعر القطعة ب27 الف و5 توصيل , سعر القطعتين ب47 الف و 5 توصيل"
 *
 * وما زاد عن قطعتين يُضاف له فرق العرض (سعر القطعتين ناقص سعر القطعة):
 *
 *   1 قطعة  = 27
 *   2 قطعة  = 47                    (من العرض)
 *   3 قطعة  = 47 + (47 - 27) = 67
 *   4 قطعة  = 47 + 2 × 20    = 87
 *
 * هذه الوحدة بلا أي استيراد من الخادم (لا prisma ولا utils) حتى تبقى قابلة
 * للاختبار وحدها — انظر lib/pricing.test.ts.
 */

const TWO_PIECES = "القطعتين";

/** تحويل الأرقام العربية/الفارسية إلى إنجليزية قبل التحليل */
function toEnglishDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 1584),
  );
}

/**
 * يستخرج سعر القطعتين من نص العروض، أو null إن لم يُذكر.
 *
 * نبحث عن أول رقم بعد كلمة «القطعتين» تحديداً — البحث عن أول رقم في النص كله
 * يلتقط سعر القطعة الواحدة لأن «القطعة» تسبق «القطعتين» دائماً.
 */
export function parseTwoPieceOfferPrice(offers?: string | null): number | null {
  if (!offers) return null;

  const text = toEnglishDigits(offers);
  const index = text.indexOf(TWO_PIECES);
  if (index === -1) return null;

  const match = text.slice(index + TWO_PIECES.length).match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;

  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export type OrderPricing = {
  /** سعر المنتج فقط بلا توصيل */
  itemsPrice: number;
  shippingPrice: number;
  totalPrice: number;
  /** من أين جاء السعر — للتشخيص وللسجلات */
  source: "single" | "offer" | "fallback";
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** حساب سعر الطلب حسب الكمية وعروض المنتج */
export function computeOrderPricing(params: {
  quantity: number;
  unitPrice: number;
  shippingPrice: number;
  offers?: string | null;
}): OrderPricing {
  const quantity = Math.max(1, Math.floor(Number(params.quantity) || 1));
  const unitPrice = Number(params.unitPrice) || 0;
  const shippingPrice = Number(params.shippingPrice) || 0;

  const build = (itemsPrice: number, source: OrderPricing["source"]) => ({
    itemsPrice: round(itemsPrice),
    shippingPrice: round(shippingPrice),
    totalPrice: round(itemsPrice + shippingPrice),
    source,
  });

  if (quantity === 1) return build(unitPrice, "single");

  const twoPiecePrice = parseTwoPieceOfferPrice(params.offers);

  // بلا عرض صالح نرجع إلى الضرب البسيط — أفضل من خصم مُختلَق
  if (twoPiecePrice === null || twoPiecePrice <= unitPrice) {
    return build(unitPrice * quantity, "fallback");
  }

  const extraPerPiece = twoPiecePrice - unitPrice;
  return build(twoPiecePrice + (quantity - 2) * extraPerPiece, "offer");
}

/**
 * مجموع أسعار عناصر طلب متعدد المنتجات — كل منتج يُسعَّر بعرضه الخاص.
 *
 * التوصيل غير مشمول: الطلب يأخذ أعلى كلفة توصيل بين عناصره (سلوك قائم)، لذلك
 * نمرّر shippingPrice: 0 لكل عنصر ونُضيف التوصيل مرة واحدة في موضع الاستدعاء.
 */
export function computeItemsPriceTotal(
  items: { productId: string; unitPrice: number; quantity: number }[],
  offersByProductId: Map<string, string | null | undefined>,
): number {
  const total = items.reduce(
    (sum, item) =>
      sum +
      computeOrderPricing({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        shippingPrice: 0,
        offers: offersByProductId.get(item.productId),
      }).itemsPrice,
    0,
  );
  return round(total);
}
