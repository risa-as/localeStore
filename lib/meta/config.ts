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
 * الصلاحيات المطلوبة. كلها تتطلب مراجعة تطبيق Meta قبل أن تعمل لحسابات ليست
 * مشرفة على التطبيق — لكنها تعمل في وضع التطوير مع حسابات المالك نفسه بلا مراجعة.
 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "ads_management",
  "ads_read",
];

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
