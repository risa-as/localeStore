import type { InboxItem } from "./inbox";
import { extractInboxLocation } from "./inbox-location";
import { extractInboxQuantity } from "./inbox-quantity";

export const SOCIAL_ORDER_NAME = "زبون";
export const digits = (text: string) => text.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632)));
const normalize = (text: string) => digits(text).replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");

/** Conservative rules: unresolved/multiple values stay blank for the operator. */
export function extractInboxOrder(items: InboxItem[]) {
  const incoming = items.filter(item => !item.outgoing && !item.system).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const original = incoming.map(item => item.text).join("\n");
  const text = normalize(original);
  const phones = [...new Set([...text.matchAll(/(?<!\d)(?:\+?964|00964|0)7\d(?:[\s-]?\d){8}(?!\d)/g)]
    .map(match => match[0].replace(/[\s-]/g, "").replace(/^(?:\+?964|00964)/, "0")))];
  const lines = incoming.flatMap(item => item.text.split("\n"));
  const { governorates, address, explicitAddress, inferredGovernorate, inferredGovernorateLabel } = extractInboxLocation(lines);
  const quantity = extractInboxQuantity(lines);
  const warnings: string[] = [];
  const cancellation = /^(?:(?:اخي|اخويه|اخوي|رجاء)\s+)?(?:اريد\s+)?(?:الغي|الغاء|الغ|الغيلي|لغي)\s+(?:الحجز|الطلب|طلبي|حجزي)(?=$|[^\p{L}])/u;
  if (incoming.some(item => item.text.split("\n").some(line => cancellation.test(normalize(line).trim()))))
    warnings.push("توجد رسالة من الزبون تطلب إلغاء الحجز؛ راجعها وتأكد من رغبته الحالية قبل اعتماد طلب جديد. لم يُلغَ أي طلب تلقائياً.");
  if (/(?:حجزت|حاجز|طلبت)[^\n]{0,60}(?:قبل|صار|صارلي|منذ)[^\n]{0,30}(?:يوم|ايام|اسبوع)|(?:بعد|لحد الان|لحد هسه)\s+ما\s+(?:وصل|وصلت|وصلني)/u.test(text))
    warnings.push("تبدو الرسالة متابعة لحجز سابق لم يصل؛ ابحث برقم الهاتف وراجع حالة الطلب قبل اعتماد حجز جديد.");
  if (inferredGovernorate)
    warnings.push(inferredGovernorateLabel
      ? `اقتُرحت ${inferredGovernorateLabel} من اسم المدينة/المنطقة في العنوان، ولم يذكر الزبون المحافظة صراحةً؛ تأكد منها قبل الاعتماد.`
      : "يتضمن العنوان مناطق قد تشير إلى أكثر من محافظة؛ اختر محافظة التوصيل بنفسك.");
  if (phones.length > 1) warnings.push("ورد أكثر من رقم هاتف؛ حدّد رقم الحجز بنفسك.");
  if (governorates.length > 1) warnings.push("وردت أكثر من محافظة؛ اختر محافظة التوصيل.");
  if (!address) warnings.push("لم أجد عنواناً بصيغة واضحة؛ راجع الرسائل وأكمله.");
  else if (!explicitAddress) warnings.push("اقتُرح العنوان من نص الرسالة؛ راجع المنطقة وأقرب نقطة دالة قبل الاعتماد.");
  const slugs = [...new Set(items.filter(item => !item.system).flatMap(item => [...item.text.matchAll(/https?:\/\/[^\s<>]+/g)].flatMap(match => {
    try {
      const url = new URL(match[0]);
      const path = url.pathname.match(/^\/(?:ar\/|en\/)?(?:landing|product)\/([^/]+)\/?$/);
      return path ? [{ host: url.host, slug: decodeURIComponent(path[1]) }] : [];
    } catch { return []; }
  })).map(item => JSON.stringify(item)))].map(item => JSON.parse(item) as { host: string; slug: string });
  return { fullName: SOCIAL_ORDER_NAME, phoneNumber: phones.length === 1 ? phones[0] : "",
    governorate: governorates.length === 1 ? governorates[0] : "", address,
    quantity, warnings, slugs };
}
