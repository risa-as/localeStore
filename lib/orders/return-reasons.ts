export const RETURN_REASONS = {
  did_not_order: "الزبون يقول إنه لم يطلب",
  price: "السعر",
  delivery_delay: "تأخر التوصيل",
  postpone: "تأجيل الاستلام",
  unsuitable: "المنتج غير مناسب",
  other: "سبب آخر / غير واضح",
} as const;

/** A review suggestion only: never changes the order or sends a message. */
export function suggestReturnReason(text: string): keyof typeof RETURN_REASONS {
  const normalized = text.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
  const matches: (keyof typeof RETURN_REASONS)[] = [];
  if (/ما طلبت|لم اطلب|مو اني|مو طلبي/.test(normalized)) matches.push("did_not_order");
  if (/غالي|السعر|سعره|ارخص/.test(normalized)) matches.push("price");
  if (/تاخر|تاخير|المندوب ما/.test(normalized)) matches.push("delivery_delay");
  if (/اجل|باجر|بعد اسبوع|مسافر/.test(normalized)) matches.push("postpone");
  if (/ما يناسب|مو مناسب|الحجم|المقاس/.test(normalized)) matches.push("unsuitable");
  return matches.length === 1 ? matches[0] : "other";
}
