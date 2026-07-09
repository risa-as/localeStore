/**
 * مزوّد التوصيل: برايم (Prime External Integration APIs)
 *
 * Base URL يتضمّن /webapi (مثال dev: https://devtest.prime-iq.com/myp/webapi).
 * المصادقة:  POST /auth/external-system-login → { accessToken, refreshToken }
 * إنشاء شحنة: POST /external/create-shipments  (جسم = مصفوفة شحنات)
 *             الرد = خريطة { "<shipmentId>": <shipmentId> } — القيمة هي رقم الشحنة.
 * المزامنة:   POST /external/shipments-info  (جسم = مصفوفة أرقام شحنات) → تفاصيل كل شحنة.
 * الحالات:    GET  /external/list-of-system-steps  (code → معنى)
 * الولايات:   GET  /general/states  (key=رمز، val=اسم عربي)
 *
 * متغيّرات البيئة المطلوبة:
 *   PRIME_BASE_URL, PRIME_LOGIN, PRIME_PASSWORD, PRIME_INITIAL_TOKEN
 *   PRIME_SENDER_ID            (رقم المتجر senderId)
 *   PRIME_MERCHANT_LOGIN_ID    (اختياري — يُستخدم PRIME_LOGIN إن لم يُحدَّد)
 *
 * الخرائط أدناه مُستخرَجة فعلياً من سيرفر برايم (GET /general/states و /list-of-system-steps).
 */
import type {
  DeliveryOrderInput,
  DeliveryProvider,
  RemoteDeliveryOrder,
  SendOrderResult,
} from "../types";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set in environment variables`);
  return v;
}

function baseUrl(): string {
  return env("PRIME_BASE_URL").replace(/\/$/, "");
}

// ── المصادقة ──
let cachedToken: { value: string; expiresAt: number } | null = null;

async function login(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetch(`${baseUrl()}/auth/external-system-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: env("PRIME_LOGIN"),
      password: env("PRIME_PASSWORD"),
      initialToken: env("PRIME_INITIAL_TOKEN"),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Prime] login failed: HTTP ${res.status} ${text}`);
  }

  const data: any = await res.json();
  // رد تسجيل الدخول: { accessToken, refreshToken, requiresChoice }
  const token = data?.accessToken ?? data?.token ?? data?.access_token;
  if (!token) {
    throw new Error("[Prime] login: لم يُرجع توكن (تحقّق من اسم الحقل في الرد)");
  }

  cachedToken = { value: String(token), expiresAt: Date.now() + 50 * 60 * 1000 };
  return cachedToken.value;
}

async function authHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await login()}`,
    "Content-Type": "application/json",
  };
}

// ── الخرائط (مُستخرَجة من نقاط برايم) ──

// اسم المحافظة (عربي/إنجليزي) → رمز الولاية في برايم (GET /general/states).
const PRIME_STATE_MAP: Record<string, string> = {
  Baghdad: "BGD", بغداد: "BGD",
  Karbala: "KRB", كربلاء: "KRB",
  Anbar: "ANB", الانبار: "ANB", الأنبار: "ANB",
  Babylon: "BBL", بابل: "BBL", الحلة: "BBL", "الحلة - بابل": "BBL",
  Basra: "BAS", البصرة: "BAS",
  Dohuk: "DOH", دهوك: "DOH",
  Diyala: "DYL", ديالى: "DYL",
  Erbil: "ARB", اربيل: "ARB", أربيل: "ARB",
  Kirkuk: "KRK", كركوك: "KRK",
  Maysan: "AMA", ميسان: "AMA", العمارة: "AMA", "العمارة - ميسان": "AMA",
  Muthanna: "SAM", المثنى: "SAM", السماوة: "SAM", "السماوة - المثنى": "SAM",
  Najaf: "NJF", النجف: "NJF",
  Nineveh: "MOS", نينوى: "MOS", الموصل: "MOS",
  Qadisiyah: "DWN", القادسية: "DWN", الديوانية: "DWN", "الديوانية - القادسية": "DWN",
  Saladin: "SAH", "صلاح الدين": "SAH",
  Sulaymaniyah: "SMH", السليمانية: "SMH",
  "Dhi Qar": "NAS", "ذي قار": "NAS", الناصرية: "NAS", "الناصرية - ذي قار": "NAS",
  Wasit: "KOT", واسط: "KOT", الكوت: "KOT", "الكوت - واسط": "KOT",
};

// رمز خطوة برايم (code من /external/list-of-system-steps) → حالة نظامنا.
// الخطوات غير المذكورة (قيد التوصيل/المخزن...) تُترك بلا تغيير أثناء المزامنة.
const PRIME_STATUS_MAP: Record<string, string> = {
  DLEIVERD: "completed", // سلمت بنجاح
  SUCCARCHV: "completed", // أرشيف المسلم بنجاح
  SUCC_CHANGEPRICE: "completed", // سلمت مع تغيير المبلغ
  PART_SUCC: "completed", // تسليم جزئي أو استبدال
  FORCE_DLV: "completed", // احتسابه واصل من الإدارة
  RTN_WITHAGENT: "failed", // تعذّر التوصيل
  POSTPONED: "rescheduled", // تعذّر التوصيل (مؤجل)
  TRY_AGAIN: "rescheduled", // إعادة توصيل
  RESENEDSHIPMENTS: "rescheduled", // شحنات لإعادة الإرسال
  RTN_INSTORE: "returned", // راجع في المخزن
  RTNARCHV: "returned", // أرشيف الراجع
  RETURNED_TO_CUSTOMER: "returnReceived", // أُرجع للتاجر
};

// ── أدوات مساعدة ──

/** برايم يستخدم الصيغة المحلية للهاتف (مثال: 07715570094). */
function formatPhoneLocal(raw: string): string {
  let phone = (raw ?? "").trim();
  if (phone.startsWith("+964")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("964")) phone = "0" + phone.slice(3);
  else if (phone.startsWith("+")) phone = phone.slice(1);
  return phone;
}

/** يبني senderSystemCaseIdWithCharacters فريداً من معرّف الطلب (أو يولّده). */
function buildCaseId(referenceId?: string): string {
  const fromRef = (referenceId ?? "").replace(/-/g, "");
  if (fromRef) return fromRef;
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export const primeProvider: DeliveryProvider = {
  name: "prime",

  async sendOrder(order: DeliveryOrderInput): Promise<SendOrderResult> {
    // تحقّق مُسبق من اكتمال إعداد برايم — يُرجع رسالة واضحة بدل رمي خطأ.
    const missing = [
      "PRIME_BASE_URL",
      "PRIME_LOGIN",
      "PRIME_PASSWORD",
      "PRIME_INITIAL_TOKEN",
      "PRIME_SENDER_ID",
    ].filter((k) => !process.env[k]);
    if (missing.length > 0) {
      return {
        success: false,
        error: `إعداد برايم غير مكتمل (${missing.join(", ")}) — هل فُعِّل متجرك على برايم بعد؟`,
      };
    }

    const caseId = buildCaseId(order.referenceId);

    try {
      // برايم لا يملك حقل «ملاحظات» موثّقاً في create-shipments،
      // فندمج ملاحظات الطلب ضمن تفاصيل العنوان لتصل للمندوب.
      const locationDetails = [order.address, order.notes]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(" — ");

      const shipment = {
        custReceiptNoOri: 0,
        district: "0",
        haveReturnItems: "N",
        locationDetails,
        merchantLoginId:
          process.env.PRIME_MERCHANT_LOGIN_ID ?? env("PRIME_LOGIN"),
        productInfo: order.productNames || "طلب إلكتروني",
        qty: order.itemsNumber ?? 1,
        receiptAmtIqd: order.price, // المبلغ المطلوب تحصيله (دينار كامل)
        receiverHp1: formatPhoneLocal(order.phone),
        receiverName: order.clientName ?? "",
        senderId: Number(env("PRIME_SENDER_ID")),
        senderSystemCaseIdWithCharacters: caseId,
        state: PRIME_STATE_MAP[(order.governorate ?? "").trim()] ?? "BGD",
      };

      const res = await fetch(`${baseUrl()}/external/create-shipments`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify([shipment]),
      });

      const bodyText = await res.text();
      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        console.error(`[Prime] create-shipments non-JSON. HTTP ${res.status}:`, bodyText);
        return { success: false, error: `HTTP ${res.status}` };
      }

      // خطأ صريح من برايم يأتي بصيغة { errorCode, errorMessage, errorType }.
      // مهم: نفحصه قبل قراءة الخريطة، وإلا قد نلتقط errorCode كأنه رقم شحنة.
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        (data.errorCode != null || data.errorMessage != null)
      ) {
        console.error("[Prime] create-shipments rejected:", data);
        const msg = data.errorMessage || `خطأ برايم ${data.errorCode}`;
        return {
          success: false,
          error: data.errorCode != null ? `${msg} (${data.errorCode})` : String(msg),
          raw: data,
        };
      }

      // النجاح: خريطة { "<shipmentId>": <shipmentId> } — القيمة هي رقم الشحنة.
      const value = Array.isArray(data)
        ? data[0]
        : data && typeof data === "object"
          ? Object.values(data)[0]
          : undefined;
      const shipmentId = Number(value);

      if (!res.ok || !Number.isFinite(shipmentId) || shipmentId <= 0) {
        console.error("[Prime] create-shipments failed:", data);
        return {
          success: false,
          error: `فشل إنشاء الشحنة (HTTP ${res.status})`,
          raw: data,
        };
      }

      return { success: true, trackingId: String(shipmentId), raw: data };
    } catch (err: any) {
      console.error("[Prime] create-shipments error:", err);
      return { success: false, error: err?.message || "خطأ في الاتصال ببرايم" };
    }
  },

  async fetchRemoteOrders(trackingIds: string[]): Promise<RemoteDeliveryOrder[]> {
    const ids = (trackingIds ?? [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return [];

    try {
      const headers = await authHeaders();
      const out: RemoteDeliveryOrder[] = [];

      // shipments-info يقبل مصفوفة أرقام — نُقسّمها لدفعات احتياطاً.
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const res = await fetch(`${baseUrl()}/external/shipments-info`, {
          method: "POST",
          headers,
          body: JSON.stringify(chunk),
        });
        if (!res.ok) {
          console.error(`[Prime] shipments-info failed: ${res.status}`);
          continue;
        }
        const list: any[] = await res.json();
        if (!Array.isArray(list)) continue;

        for (const o of list) {
          const trackingId = String(o?.caseid ?? "");
          if (!trackingId || trackingId === "0") continue;
          // الحالة قد تكون في stepCode (الخطوة الدقيقة) أو shipmentStatus (العامة):
          // نطابق أيّهما على حالة معروفة (stepCode أولاً ثم shipmentStatus).
          const rawStep = o?.stepCode != null ? String(o.stepCode) : null;
          const rawShip = o?.shipmentStatus != null ? String(o.shipmentStatus) : null;
          const localStatus =
            (rawStep ? PRIME_STATUS_MAP[rawStep] : undefined) ??
            (rawShip ? PRIME_STATUS_MAP[rawShip] : undefined) ??
            null;
          out.push({
            trackingId,
            rawStatus: rawStep ?? rawShip,
            localStatus,
            collectedPrice: o?.receiptAmtIqd != null ? Number(o.receiptAmtIqd) : null,
            clientName: o?.receiverName ?? null,
            phone: o?.receiverHp1 ?? null,
          });
        }
      }

      return out;
    } catch (err) {
      console.error("[Prime] shipments-info error:", err);
      return [];
    }
  },
};

// ── أدوات تشخيص (تُستخدم في /api/prime/debug) ──
export async function primeFetchStates(): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/general/states`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return res.json();
}

export async function primeFetchSystemSteps(): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/external/list-of-system-steps`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return res.json();
}

/** يجلب متاجر التاجر — كل shop id هو قيمة senderId المستخدمة في إنشاء الشحنات. */
export async function primeFetchMerchantShops(): Promise<unknown> {
  const merchantLoginId =
    process.env.PRIME_MERCHANT_LOGIN_ID ?? env("PRIME_LOGIN");
  const res = await fetch(
    `${baseUrl()}/external/merchant-shops/${encodeURIComponent(merchantLoginId)}`,
    { headers: await authHeaders(), cache: "no-store" },
  );
  return res.json();
}

export { login as primeLogin, PRIME_STATUS_MAP, PRIME_STATE_MAP };
