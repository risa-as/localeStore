/** مراحل المنتج المرشح للاستيراد — ملف مستقل يستورده الخادم والمتصفح. */

export const IMPORT_STATUSES = [
  "studying",
  "ordered",
  "arrived",
  "converted",
  "rejected",
] as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  studying: "قيد الدراسة",
  ordered: "تم الطلب",
  arrived: "وصل",
  converted: "أُضيف للمخزون",
  rejected: "مرفوض",
};

/** مراحل يُجمَّد عندها الحساب (لقطة) ويُحسب رأس مالها في لوحة القيادة. */
export const COMMITTED_STATUSES: readonly ImportStatus[] = ["ordered", "arrived"];

/** المراحل التي يمكن اختيارها يدوياً — «أُضيف للمخزون» يتم فقط عبر زر التحويل. */
export const MANUAL_STATUSES: readonly ImportStatus[] = IMPORT_STATUSES.filter(
  (s) => s !== "converted",
);

export function isImportStatus(v: string): v is ImportStatus {
  return (IMPORT_STATUSES as readonly string[]).includes(v);
}

/**
 * مراحل قديمة دُمجت: «فكرة» صارت «قيد الدراسة»، و«موافَق عليه» و«في الشحن»
 * صارتا «تم الطلب». الصفوف القديمة تبقى كما هي في قاعدة البيانات وتُقرأ بالمرحلة الجديدة.
 */
const LEGACY_STATUSES: Record<string, ImportStatus> = {
  idea: "studying",
  approved: "ordered",
  shipping: "ordered",
};

export function normalizeImportStatus(v: string): ImportStatus {
  return isImportStatus(v) ? v : LEGACY_STATUSES[v] ?? "studying";
}
