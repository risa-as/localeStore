/** مراحل المنتج المرشح للاستيراد — ملف مستقل يستورده الخادم والمتصفح. */

export const IMPORT_STATUSES = [
  "idea",
  "studying",
  "approved",
  "ordered",
  "shipping",
  "arrived",
  "converted",
  "rejected",
] as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  idea: "فكرة",
  studying: "قيد الدراسة",
  approved: "موافَق عليه",
  ordered: "تم الطلب",
  shipping: "في الشحن",
  arrived: "وصل",
  converted: "أُضيف للمخزون",
  rejected: "مرفوض",
};

/** مراحل يُجمَّد عندها الحساب (لقطة) ويُحسب رأس مالها في لوحة القيادة. */
export const COMMITTED_STATUSES: readonly ImportStatus[] = [
  "approved",
  "ordered",
  "shipping",
  "arrived",
];

/** المراحل التي يمكن اختيارها يدوياً — «أُضيف للمخزون» يتم فقط عبر زر التحويل. */
export const MANUAL_STATUSES: readonly ImportStatus[] = IMPORT_STATUSES.filter(
  (s) => s !== "converted",
);

export function isImportStatus(v: string): v is ImportStatus {
  return (IMPORT_STATUSES as readonly string[]).includes(v);
}
