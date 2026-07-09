/**
 * مزوّد التوصيل: مدن إكسبريس (Modon Express)
 * Base URL: https://mcht.modon-express.net/v1
 * المصادقة: token عبر باراميتر الرابط ?token=...
 * صيغة الإرسال: multipart/form-data — صيغة الاستقبال: JSON
 */
import type {
  DeliveryOrderInput,
  DeliveryProvider,
  RemoteDeliveryOrder,
  SendOrderResult,
} from "../types";

const BASE = "https://mcht.modon-express.net/v1";

function getToken(): string {
  const token = process.env.MODON_TOKEN;
  if (!token)
    throw new Error("MODON_TOKEN is not set in environment variables");
  return token;
}

// ── خريطة المحافظات العراقية → city_id في مدن (من GET /merchant/citys) ──
const MODON_CITY_MAP: Record<string, string> = {
  Baghdad: "1",
  بغداد: "1",
  Karbala: "2",
  كربلاء: "2",
  Anbar: "3",
  الانبار: "3",
  الأنبار: "3",
  Babylon: "4",
  "الحلة - بابل": "4",
  بابل: "4",
  الحلة: "4",
  Basra: "5",
  البصرة: "5",
  Dohuk: "6",
  دهوك: "6",
  Diyala: "7",
  ديالى: "7",
  Erbil: "8",
  اربيل: "8",
  أربيل: "8",
  Kirkuk: "9",
  كركوك: "9",
  Maysan: "10",
  "العمارة - ميسان": "10",
  ميسان: "10",
  العمارة: "10",
  Muthanna: "11",
  "السماوة - المثنى": "11",
  المثنى: "11",
  السماوة: "11",
  Najaf: "12",
  النجف: "12",
  Nineveh: "13",
  نينوى: "13",
  الموصل: "13",
  Qadisiyah: "14",
  "الديوانية - القادسية": "14",
  القادسية: "14",
  الديوانية: "14",
  Saladin: "15",
  "صلاح الدين": "15",
  Sulaymaniyah: "16",
  السليمانية: "16",
  "Dhi Qar": "17",
  "الناصرية - ذي قار": "17",
  "ذي قار": "17",
  الناصرية: "17",
  Wasit: "18",
  "الكوت - واسط": "18",
  واسط: "18",
  الكوت: "18",
};

// منطقة "أخرى" الافتراضية لكل محافظة — من GET /merchant/regions
const MODON_REGION_MAP: Record<string, string> = {
  "1": "5755",
  "2": "5407",
  "3": "5408",
  "4": "5409",
  "5": "5429",
  "6": "5411",
  "7": "5746",
  "8": "5413",
  "9": "5414",
  "10": "5426",
  "11": "5753",
  "12": "5417",
  "13": "5418",
  "14": "5419",
  "15": "5420",
  "16": "5421",
  "17": "5428",
  "18": "5423",
};

// ── خريطة تحويل status_id مدن → حالات النظام ──
const MODON_STATUS_MAP: Record<string, string> = {
  "4": "completed", // تم تسليم الطلب الى الزبون
  "21": "completed", // تم التسليم واستلام مبلغ الاسترجاع
  "15": "returned", // ارجاع الطلب الى العميل
  "19": "returned", // ارجاع بعد الاستلام
  "17": "returnReceived", // تم استلامه من قبل التاجر
  "29": "rescheduled", // تأجيل من قبل الزبون
  "30": "rescheduled", // تأجيل الى وقت غير معروف
  "14": "rescheduled", // سيُعاد ارساله الى الزبون
  "44": "rescheduled", // سيُعاد ارسال الطلب
  "25": "failed", // لم يتم الرد من الزبون
  "26": "failed", // لم يتم الرد بعد الاتفاق
  "27": "failed", // رقم الهاتف مغلق
  "28": "failed", // الهاتف مغلق بعد الاتفاق
  "31": "failed", // الغى الزبون الطلب مسبقاً
  "32": "failed", // رفض الزبون الطلب
  "38": "failed", // عنوان الزبون غير دقيق
  "39": "failed", // الزبون لم يطلب
  "41": "failed", // لا يمكن الاتصال بالزبون
};

/** تنسيق رقم الهاتف إلى الصيغة الدولية التي تتوقعها مدن (+964...) */
function formatPhone(raw: string): string {
  let phone = raw ?? "";
  if (phone.startsWith("0")) {
    phone = "+964" + phone.slice(1);
  } else if (!phone.startsWith("+")) {
    phone = "+" + phone;
  }
  return phone;
}

export const modonProvider: DeliveryProvider = {
  name: "modon",

  async sendOrder(order: DeliveryOrderInput): Promise<SendOrderResult> {
    const cityId = MODON_CITY_MAP[(order.governorate ?? "").trim()] ?? "1";
    const regionId = MODON_REGION_MAP[cityId] ?? cityId;

    const form = new FormData();
    form.append("client_name", order.clientName ?? "");
    form.append("client_mobile", formatPhone(order.phone));
    form.append("city_id", cityId);
    form.append("region_id", regionId);
    if (order.address) form.append("location", order.address);
    form.append("items_number", String(order.itemsNumber ?? 1));
    form.append("price", String(order.price));
    form.append("type_name", order.productNames || "طلب إلكتروني");
    form.append("package_size", "1");
    form.append("replacement", "0");
    if (order.notes) form.append("merchant_notes", order.notes);

    try {
      const res = await fetch(
        `${BASE}/merchant/create-order?token=${getToken()}`,
        { method: "POST", body: form },
      );

      const bodyText = await res.text();
      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        console.error(`[Modon] Non-JSON response. HTTP ${res.status}:`, bodyText);
        return { success: false, error: `HTTP ${res.status}` };
      }

      if (!res.ok || data?.status === false) {
        console.error("[Modon] create-order validation failed:", data);
        return {
          success: false,
          error: data?.msg || "فشل التحقّق من البيانات",
          raw: data,
        };
      }

      const qrId = data?.data?.qr_id ?? data?.qr_id;
      if (!qrId) {
        return {
          success: false,
          error: data?.msg || "لم تُرجع مدن رقم بوليصة",
          raw: data,
        };
      }
      return { success: true, trackingId: String(qrId), raw: data };
    } catch (err: any) {
      console.error("[Modon] create-order error:", err);
      return { success: false, error: err?.message || "خطأ في الاتصال بمدن" };
    }
  },

  async fetchRemoteOrders(): Promise<RemoteDeliveryOrder[]> {
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
      const list: any[] = Array.isArray(data) ? data : (data?.data ?? []);

      return list
        .map((o: any): RemoteDeliveryOrder => {
          const trackingId = String(o.id ?? o.qr_id ?? "");
          const rawStatus = o.status_id != null ? String(o.status_id) : null;
          return {
            trackingId,
            rawStatus,
            localStatus: rawStatus ? (MODON_STATUS_MAP[rawStatus] ?? null) : null,
            collectedPrice: o.price != null ? Number(o.price) : null,
            clientName: o.client_name ?? null,
            phone: o.client_mobile ?? null,
          };
        })
        .filter((o) => o.trackingId !== "");
    } catch (err) {
      console.error("[Modon] merchant-orders error:", err);
      return [];
    }
  },
};
