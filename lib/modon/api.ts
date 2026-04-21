/**
 * Modon Express Delivery API Service
 * Base URL: https://mcht.modon-express.net/v1
 * Auth: token via query param ?token=...
 */

const BASE = "https://mcht.modon-express.net/v1";

function getToken(): string {
  const token = process.env.MODON_TOKEN;
  if (!token)
    throw new Error("MODON_TOKEN is not set in environment variables");
  return token;
}

// ── خريطة المحافظات العراقية → city_id في موذن ──
// مُحدَّثة من نتيجة GET /merchant/citys
export const MODON_CITY_MAP: Record<string, string> = {
  // Baghdad
  Baghdad: "1",
  بغداد: "1",
  // Karbala
  Karbala: "2",
  كربلاء: "2",
  // Anbar
  Anbar: "3",
  الانبار: "3",
  الأنبار: "3",
  // Babylon
  Babylon: "4",
  "الحلة - بابل": "4",
  بابل: "4",
  الحلة: "4",
  // Basra
  Basra: "5",
  البصرة: "5",
  // Dohuk
  Dohuk: "6",
  دهوك: "6",
  // Diyala
  Diyala: "7",
  ديالى: "7",
  // Erbil
  Erbil: "8",
  اربيل: "8",
  أربيل: "8",
  // Kirkuk
  Kirkuk: "9",
  كركوك: "9",
  // Maysan
  Maysan: "10",
  "العمارة - ميسان": "10",
  ميسان: "10",
  العمارة: "10",
  // Muthanna
  Muthanna: "11",
  "السماوة - المثنى": "11",
  المثنى: "11",
  السماوة: "11",
  // Najaf
  Najaf: "12",
  النجف: "12",
  // Nineveh
  Nineveh: "13",
  نينوى: "13",
  الموصل: "13",
  // Qadisiyah
  Qadisiyah: "14",
  "الديوانية - القادسية": "14",
  القادسية: "14",
  الديوانية: "14",
  // Saladin
  Saladin: "15",
  "صلاح الدين": "15",
  // Sulaymaniyah
  Sulaymaniyah: "16",
  السليمانية: "16",
  // Dhi Qar
  "Dhi Qar": "17",
  "الناصرية - ذي قار": "17",
  "ذي قار": "17",
  الناصرية: "17",
  // Wasit
  Wasit: "18",
  "الكوت - واسط": "18",
  واسط: "18",
  الكوت: "18",
};

// ── خريطة تحويل status_id موذن → حالات النظام ──
export const MODON_STATUS_MAP: Record<string, string> = {
  "4":  "completed",      // بكل حرص تم تسليم الطلب الى الزبون
  "21": "completed",      // تم التسليم للزبون واستلام منة الاسترجاع
  "15": "returned",       // ارجاع الطلب الى العميل
  "19": "returned",       // ارجاع بعد الاستلام
  "17": "returnReceived", // تم استلامه من قبل العميل (التاجر)
  "29": "rescheduled",    // تم تأجيل الطلب من قبل الزبون
  "30": "rescheduled",    // تم تأجيل الطلب الى وقت غير معروف
  "14": "rescheduled",    // سيتم إعادة ارساله الى الزبون
  "44": "rescheduled",    // بكُل حب سيتم إعادة ارسال الطلب
  "25": "failed",         // لم يتم الرد من الزبون
  "26": "failed",         // لم يتم الرد بعد الاتفاق معه
  "27": "failed",         // رقم الهاتف مغلق
  "28": "failed",         // رقم الهاتف مغلق بعد الاتفاق معه
  "31": "failed",         // تم الغاء الطلب من قبل الزبون مسبقاً
  "32": "failed",         // تم رفض الطلب من قبل الزبون
  "38": "failed",         // عنوان الزبون غير دقيق
  "39": "failed",         // الزبون لم يطلب
  "41": "failed",         // لا يمكن الاتصال برقم الزبون
};

export type SendOrderParams = {
  client_name: string;
  client_mobile: string;
  city_id: string;
  region_id?: string;
  location?: string;
  items_number: number;
  price: number;
  type_name?: string; // نوع البضاعة (مثل: ملابس، طلب جديد)
  package_size?: string; // حجم الطلب (1=عادي)
  replacement?: number; // 0 = طلب جديد, 1 = استبدال
  merchant_notes?: string;
};

/**
 * إرسال طلب جديد إلى موذن
 * تُستدعى تلقائياً عند تحويل الطلب إلى حالة "pending"
 * تُعيد { qr_id: string, ... } عند النجاح
 */
export async function sendOrderToModon(order: SendOrderParams) {
  const regionId =
    order.region_id && /^\d+$/.test(order.region_id)
      ? order.region_id
      : (MODON_REGION_MAP[order.city_id] ?? order.city_id);

  const form = new FormData();
  form.append("client_name", order.client_name);
  form.append("client_mobile", order.client_mobile);
  form.append("city_id", String(order.city_id));
  form.append("region_id", regionId);
  if (order.location) form.append("location", order.location);
  form.append("items_number", String(order.items_number));
  form.append("price", String(order.price));

  // 🔥 التعديل هنا: يجب إضافة الحقول الاختيارية إذا كانت موجودة في الـ order
  if (order.type_name) form.append("type_name", order.type_name);
  if (order.package_size) form.append("package_size", order.package_size);
  if (order.merchant_notes) form.append("merchant_notes", order.merchant_notes);
  if (order.replacement !== undefined)
    form.append("replacement", String(order.replacement));

  // ثم تبقي على الفحص الاحتياطي (Fallback)
  if (!form.has("type_name")) form.append("type_name", "طلب إلكتروني");
  if (!form.has("replacement")) form.append("replacement", "0");
  if (!form.has("package_size")) form.append("package_size", "1");
  try {
    const res = await fetch(
      `${BASE}/merchant/create-order?token=${getToken()}`,
      { method: "POST", body: form },
    );

    const bodyText = await res.text();
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      console.error(`[Modon] Non-JSON response. HTTP ${res.status}:`, bodyText);
      return null;
    }

    if (!res.ok || data.status === false) {
      console.error(`[Modon] create-order validation failed:`, data);
      return data; // إرجاع كائن الخطأ الكامل
    }

    return data;
  } catch (err) {
    console.error("[Modon] create-order error:", err);
    return null;
  }
}

/**
 * جلب جميع طلبات التاجر من موذن (للمزامنة الدورية)
 */
export async function fetchModonOrders() {
  try {
    const res = await fetch(
      `${BASE}/merchant/merchant-orders?token=${getToken()}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      console.error(`[Modon] merchant-orders failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch (err) {
    console.error("[Modon] merchant-orders error:", err);
    return [];
  }
}

/**
 * جلب المدن المتاحة في موذن
 * استخدمها مرة واحدة لتحديث MODON_CITY_MAP
 */
export async function fetchModonCities() {
  try {
    const res = await fetch(`${BASE}/merchant/citys?token=${getToken()}`, {
      next: { revalidate: 3600 },
    });
    return res.json();
  } catch (err) {
    console.error("[Modon] citys error:", err);
    return [];
  }
}

// منطقة "أخرى" الافتراضية لكل محافظة — مُستخرجة من GET /merchant/regions
export const MODON_REGION_MAP: Record<string, string> = {
  "1": "5755", // Baghdad
  "2": "5407", // Karbala
  "3": "5408", // Anbar
  "4": "5409", // Babylon
  "5": "5429", // Basra
  "6": "5411", // Dohuk
  "7": "5746", // Diyala
  "8": "5413", // Erbil
  "9": "5414", // Kirkuk
  "10": "5426", // Maysan
  "11": "5753", // Muthanna
  "12": "5417", // Najaf
  "13": "5418", // Nineveh
  "14": "5419", // Qadisiyah
  "15": "5420", // Saladin
  "16": "5421", // Sulaymaniyah
  "17": "5428", // Dhi Qar
  "18": "5423", // Wasit
};

/**
 * تعديل طلب موجود في موذن
 */
export async function editModonOrder(
  qr_id: string,
  data: Partial<SendOrderParams>,
) {
  const form = new FormData();
  form.append("qr_id", qr_id);
  Object.entries(data).forEach(([k, v]) => {
    if (v != null) form.append(k, String(v));
  });

  try {
    const res = await fetch(`${BASE}/merchant/edit-order?token=${getToken()}`, {
      method: "POST",
      body: form,
    });
    return res.json();
  } catch (err) {
    console.error("[Modon] edit-order error:", err);
    return null;
  }
}
