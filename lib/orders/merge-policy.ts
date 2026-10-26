/**
 * سياسة دمج الطلبات المتقاربة زمنياً من رقم الهاتف نفسه.
 *
 * النظام يدمج الطلبات خلال ١٨ ساعة في طلب واحد لتوفير كلفة توصيل. هذه الوحدة
 * تُقرّر ماذا يحدث لكل صنف ولبيانات التوصيل عند الدمج — والقاعدة الجوهرية:
 *
 *   **لا تُجمَع كمية المنتج نفسه تلقائياً.**
 *
 * السبب: الزبون الذي يعيد طلب المنتج نفسه خلال ساعات يفعل ذلك غالباً لأنه ظنّ
 * أن طلبه الأول لم ينجح، لا لأنه يريد قطعتين. جمعُ الكمية صامتاً كان يوصله
 * قطعتين فيرفض واحدة — فيخسر المتجر التوصيل ذهاباً وإياباً. من يريد قطعتين
 * فعلاً أمامه محدّد الكمية في صفحة الهبوط، وتسعير العروض يكافئه عليه.
 *
 * المنتجات المختلفة تُضاف إلى الطلب القائم كما كان — هذا هو الغرض المشروع من
 * الدمج ولم يتغيّر.
 *
 * وحدة نقيّة بلا أي استيراد من الخادم (لا prisma) لتبقى قابلة للاختبار وحدها —
 * انظر lib/orders/merge-policy.test.ts.
 */

/** قرار الدمج لصنف واحد داخل طلب قائم. */
export type ItemMergeDecision =
  /** المنتج غير موجود في الطلب القائم — يُضاف صنفاً جديداً. */
  | { kind: "append" }
  /** المنتج موجود — الكمية تبقى كما هي وتُسجَّل ملاحظة للتأكيد الهاتفي. */
  | { kind: "duplicate"; existingQty: number; requestedQty: number };

export function decideItemMerge(
  existingQty: number | null | undefined,
  requestedQty: number,
): ItemMergeDecision {
  if (existingQty == null) return { kind: "append" };
  return { kind: "duplicate", existingQty, requestedQty };
}

/** بيانات التوصيل التي قد تُستبدل على الطلب القائم عند الدمج. */
export type ShippingInfo = {
  fullName: string;
  governorate: string;
  address: string;
};

/** قرار تحديث بيانات التوصيل على الطلب القائم. */
export type ShippingUpdateDecision =
  /** نفس الوجهة — التحديث آمن (تصحيح إملائي للاسم مثلاً). */
  | { kind: "update" }
  /** وجهة مختلفة — لا نغيّر عنوان طلب قائم؛ تُسجَّل ملاحظة بدلاً من ذلك. */
  | { kind: "keep"; incoming: ShippingInfo };

const normalize = (v: string | null | undefined) =>
  (v || "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * الطلب الثاني كان يستبدل اسم ومحافظة وعنوان الطلب القائم، ويُعيد حساب كلفة
 * التوصيل الفعلية على المحافظة الجديدة. فمن يطلب قطعة لعنوان آخر كان يُغيّر
 * وجهة طلبه الأول دون أن يدري — وتُحتسب كلفة توصيل محافظة خاطئة.
 */
export function decideShippingUpdate(
  existing: ShippingInfo,
  incoming: ShippingInfo,
): ShippingUpdateDecision {
  const sameDestination =
    normalize(existing.governorate) === normalize(incoming.governorate) &&
    normalize(existing.address) === normalize(incoming.address);

  return sameDestination ? { kind: "update" } : { kind: "keep", incoming };
}

/** توقيت بغداد (UTC+3) بصيغة مختصرة للملاحظات: `09/07 14:32`. */
export function baghdadStamp(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** ملاحظة الطلب المكرّر — تُعرض لموظّف التأكيد في جدول الطلبات. */
export function duplicateNote(
  productName: string,
  requestedQty: number,
  now: Date = new Date(),
): string {
  return `⚠️ طلب مكرّر ${baghdadStamp(now)}: أعاد الزبون طلب «${productName}» (كمية مطلوبة: ${requestedQty}) — لم تُزَد الكمية. أكّد الكمية معه قبل الإرسال.`;
}

/** ملاحظة اختلاف وجهة التوصيل عن الطلب القائم. */
export function differentAddressNote(
  incoming: ShippingInfo,
  now: Date = new Date(),
): string {
  return `ℹ️ طلب مضاف ${baghdadStamp(now)} بوجهة مختلفة: «${incoming.governorate} — ${incoming.address}» باسم «${incoming.fullName}». وجهة الطلب الأصلي لم تُغيَّر.`;
}

/**
 * يُلحق ملاحظة جديدة بالملاحظات القائمة بلا تكرار حرفي.
 * الإلحاق لا الاستبدال: ملاحظات الموظّفين اليدوية يجب ألّا تُمحى.
 */
export function appendNote(
  existing: string | null | undefined,
  addition: string,
): string {
  const current = (existing || "").trim();
  if (!current) return addition;
  if (current.includes(addition)) return current;
  return `${current}\n${addition}`;
}
