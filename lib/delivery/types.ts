/**
 * طبقة تجريد شركات التوصيل (Delivery Providers)
 * ----------------------------------------------
 * تُختار الشركة الفعّالة عبر متغيّر البيئة DELIVERY_PROVIDER (modon | prime).
 * كل شركة تنفّذ واجهة DeliveryProvider، فيبقى منطق الطلبات (order.actions) موحّداً
 * ولا يعرف بأي شركة يتعامل.
 */

/** مدخل موحّد لطلب التوصيل — بيانات نظامنا كما هي، والمزوّد يحوّلها لصيغة الـ API الخاصة به. */
export type DeliveryOrderInput = {
  clientName: string;
  /** رقم الهاتف كما هو مخزّن عندنا — المزوّد يصيغه دولياً حسب متطلباته */
  phone: string;
  /** اسم المحافظة — المزوّد يحوّله إلى رقم/معرّف داخلي (city_id / state_id) */
  governorate: string;
  address?: string | null;
  itemsNumber: number;
  /** السعر الكامل بالدينار العراقي (بعد تطبيق ×1000 إن لزم في طبقة الطلبات) */
  price: number;
  /** أسماء المنتجات مفصولة بـ " + " */
  productNames: string;
  notes?: string | null;
  /** معرّف الطلب في نظامنا — يُستخدم كمرجع فريد لدى الشركة (مثل senderSystemCaseIdWithCharacters في برايم) */
  referenceId?: string;
};

/** نتيجة إرسال الطلب إلى شركة التوصيل. */
export type SendOrderResult = {
  success: boolean;
  /** رقم البوليصة/الشحنة الراجع (qr_id في مدن) — يُحفظ كمعرّف تتبّع محلياً */
  trackingId?: string;
  /** رسالة الخطأ عند الفشل (تُعرض للمستخدم) */
  error?: string;
  /** الرد الخام للتشخيص */
  raw?: unknown;
};

/**
 * طلب بعيد بعد تطبيعه من رد شركة التوصيل — يُستخدم في المزامنة والإحصاءات.
 * كل مزوّد مسؤول عن تحويل شكله الخاص إلى هذا الشكل الموحّد (بما فيه خريطة الحالات).
 */
export type RemoteDeliveryOrder = {
  /** المعرّف الذي نطابق به الطلب المحلي (= قيمة trackingId المحفوظة عند الإرسال) */
  trackingId: string;
  /** رمز الحالة الخام لدى الشركة (status_id في مدن) */
  rawStatus: string | null;
  /** الحالة بعد التحويل إلى مصطلحات نظامنا (completed/returned/...) أو null إذا غير معروفة */
  localStatus: string | null;
  /** المبلغ المُحصَّل كما ترجعه الشركة (دينار كامل) — أو null */
  collectedPrice: number | null;
  clientName?: string | null;
  phone?: string | null;
};

/** الواجهة التي تنفّذها كل شركة توصيل. */
export interface DeliveryProvider {
  /** اسم المزوّد (للسجلّات والتشخيص) */
  readonly name: string;
  /** إرسال طلب جديد إلى شركة التوصيل */
  sendOrder(order: DeliveryOrderInput): Promise<SendOrderResult>;
  /**
   * جلب حالات الطلبات من الشركة مُطبَّعة — للمزامنة الدورية والإحصاءات.
   * يُمرَّر معرّفات التتبّع المحلية: بعض الشركات تستعلم بها (برايم: shipments-info)،
   * وبعضها يتجاهلها وتجلب كل الطلبات (مدن: merchant-orders).
   */
  fetchRemoteOrders(trackingIds: string[]): Promise<RemoteDeliveryOrder[]>;
}
