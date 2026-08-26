import crypto from "crypto";

/**
 * وحدة إعداد Meta المركزية (فيسبوك + إنستغرام + الإعلانات).
 *
 * كل الإعداد يأتي من متغيرات البيئة حتى يضع كل نشر Vercel مستقل تطبيقه الخاص:
 *
 *   META_APP_ID          معرّف تطبيق Meta
 *   META_APP_SECRET      السر الخاص بالتطبيق (يوقّع الطلبات ويُبادل التوكنات)
 *   META_OAUTH_REDIRECT  (اختياري) رابط الـ callback؛ إن غاب نشتقّه من الطلب
 *   META_GRAPH_VERSION   (اختياري) نسخة Graph API، الافتراضي v25.0
 *
 * ملاحظة أمان: التوكنات لا تصل إلى المتصفح أبداً — كل استدعاءات Graph تتم في
 * السيرفر فقط، والإجراءات (server actions) تُرجع بيانات منقّاة بلا توكنات.
 */

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";

/**
 * الصلاحيات المطلوبة.
 *
 * قابلة للضبط من البيئة عبر META_SCOPES (مفصولة بفواصل) حتى تُعدَّل بسهولة دون
 * تغيير الكود — مفيد لأن Meta ترفض أي صلاحية لم يُضَف منتجها/حالة استخدامها في
 * لوحة التطبيق («Invalid Scopes»)، وأسماء صلاحيات إنستغرام في مرحلة انتقال
 * (instagram_basic ← instagram_business_basic).
 *
 * للاتصال فوراً بأقل مجموعة تعمل عادةً بلا إعداد إضافي، ضع في .env:
 *   META_SCOPES=pages_show_list,pages_read_engagement,business_management,ads_management,ads_read
 * ثم أضِف صلاحيات النشر/إنستغرام تدريجياً بعد إضافة منتجاتها في لوحة Meta.
 */
const DEFAULT_META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "ads_management",
  "ads_read",
];

export const META_SCOPES = process.env.META_SCOPES
  ? process.env.META_SCOPES.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_META_SCOPES;

export type MetaConfig = {
  appId: string;
  appSecret: string;
  redirectOverride?: string;
};

export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    redirectOverride: process.env.META_OAUTH_REDIRECT,
  };
}

/** رابط الـ callback: من البيئة إن وُجد، وإلا يُشتقّ من أصل الطلب الحالي. */
export function getRedirectUri(requestOrigin: string): string {
  return (
    getMetaConfig()?.redirectOverride ||
    `${requestOrigin}/api/meta/oauth/callback`
  );
}

/**
 * القاعدة العامة لروابط صفحات الهبوط في الإعلانات (الإنتاج، وليس localhost).
 * يجب أن تكون رابطاً عاماً تصله فيسبوك — لذا لا نشتقّها من أصل الطلب (قد يكون
 * localhost أثناء التطوير). تُضبط في .env: META_ADS_BASE_URL=https://<domain>
 */
export function getAdsBaseUrl(): string | null {
  const u = process.env.META_ADS_BASE_URL?.trim();
  return u ? u.replace(/\/+$/, "") : null;
}

/** يرفض روابط localhost/الشبكة الخاصة — فيسبوك لا تصلها. */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".local") ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return false;
  }
  return true;
}

// ─── حماية OAuth: قيمة state موقّعة ومربوطة بالجلسة ──────────────────────────
//
// state ليست قيمة عشوائية فحسب، بل توقيع HMAC على معرّف المستخدم + طابع زمني.
// هذا يمنع أي callback شارد من ربط أصول Meta لطرف آخر بالمتجر (الصفحة تكتب صفاً
// واحداً مشتركاً) ويثبت أن نفس المشرف بدأ العملية وأنهاها.

const STATE_TTL_MS = 10 * 60 * 1000; // 10 دقائق

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function signOAuthState(userId: string): string {
  const secret = getMetaConfig()?.appSecret;
  if (!secret) throw new Error("Meta غير مُهيأ");
  const payload = `${userId}.${Date.now()}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest();
  return `${b64url(payload)}.${b64url(sig)}`;
}

/** يتحقق أن state موقّعة بصحة، وتخصّ هذا المستخدم، ولم تنتهِ صلاحيتها. */
export function verifyOAuthState(state: string, expectedUserId: string): boolean {
  const secret = getMetaConfig()?.appSecret;
  if (!secret) return false;
  const parts = state.split(".");
  if (parts.length !== 2) return false;

  const payload = Buffer.from(
    parts[0].replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString();
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest();
  const gotSig = Buffer.from(
    parts[1].replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );

  if (
    expectedSig.length !== gotSig.length ||
    !crypto.timingSafeEqual(expectedSig, gotSig)
  ) {
    return false;
  }

  const [userId, tsRaw] = payload.split(".");
  const ts = Number(tsRaw);
  if (userId !== expectedUserId) return false;
  if (!Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) return false;
  return true;
}
