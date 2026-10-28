import { createHmac } from "node:crypto";
import { graphGet, GraphError } from "./graph";
import type { SocialPlatform } from "./inbox";

type TokenInfo = {
  app_id?: string; is_valid?: boolean; type?: string; profile_id?: string;
  expires_at?: number; data_access_expires_at?: number; scopes?: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
};
export type InboxConnectionHealth = {
  status: "healthy" | "attention" | "unknown";
  checkedAt: string;
  issues: string[];
  // Successful token checks do not establish App Review or recipient eligibility.
  message: string;
};

/** Stable, secret-keyed comparison across reconnects; never log a token itself. */
export function inboxTokenFingerprint(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("hex").slice(0, 16);
}

/** GET-only checks of the actual Page token used by the Send API. */
export async function inspectInboxConnection(input: {
  pageId: string; platform: SocialPlatform; pageToken: string; userToken: string;
  appId: string; appSecret: string;
}): Promise<InboxConnectionHealth> {
  const { pageId, platform, pageToken, userToken, appId, appSecret } = input;
  const permission = platform === "facebook" ? "pages_messaging" : "instagram_manage_messages";
  const [debug, identity, permissions] = await Promise.allSettled([
    graphGet<{ data?: TokenInfo }>("debug_token", `${appId}|${appSecret}`, { input_token: pageToken }, { signal: AbortSignal.timeout(5000) }),
    graphGet<{ id?: string }>("me", pageToken, { fields: "id" }, { signal: AbortSignal.timeout(5000) }),
    graphGet<{ data?: { permission: string; status: string }[] }>("me/permissions", userToken, undefined, { signal: AbortSignal.timeout(5000) }),
  ]);
  const issues: string[] = [];
  let incomplete = false;
  const now = Date.now() / 1000;
  if (debug.status === "fulfilled" && debug.value?.data) {
    const info = debug.value.data;
    if (!info.app_id || !info.type || !Array.isArray(info.scopes)) {
      incomplete = true;
      issues.push("أعادت Meta فحصاً غير مكتمل لرمز الصفحة؛ أعد الفحص.");
    }
    if (info.is_valid !== true) issues.push("رمز الصفحة غير صالح؛ أعد ربط حساب Meta.");
    if (info.app_id && info.app_id !== appId) issues.push("رمز الصفحة تابع لتطبيق آخر؛ أعد الربط باستخدام تطبيق المتجر.");
    if (info.type && info.type !== "PAGE") issues.push("الرمز المحفوظ ليس رمز صفحة؛ أعد ربط الصفحة.");
    if (info.profile_id && info.profile_id !== pageId) issues.push("رمز الإرسال يخص صفحة أخرى؛ أعد ربط الصفحة المطلوبة.");
    if ((info.expires_at && info.expires_at <= now) || (info.data_access_expires_at && info.data_access_expires_at <= now))
      issues.push("انتهت مدة رمز الصفحة أو الوصول إلى بياناتها؛ أعد الربط.");
    if (info.scopes && !info.scopes.includes(permission)) issues.push(`رمز الصفحة لا يحمل إذن ${permission}؛ أعد الربط بعد منحه.`);
    const grant = info.granular_scopes?.find(scope => scope.scope === permission);
    // Instagram grants can be scoped to IG IDs rather than the linked Page ID.
    if (platform === "facebook" && grant?.target_ids && !grant.target_ids.includes(pageId))
      issues.push("إذن المراسلة غير ممنوح لهذه الصفحة؛ اخترها عند إعادة الربط.");
  } else {
    incomplete = true;
    issues.push("تعذر التحقق من تطبيق رمز الصفحة وصلاحيته لدى Meta.");
  }
  if (identity.status === "fulfilled" && identity.value?.id) {
    if (identity.value.id !== pageId) issues.push("هوية رمز الإرسال لا تطابق الصفحة المختارة؛ أعد الربط.");
  } else {
    incomplete = true;
    issues.push(identity.status === "rejected" && identity.reason instanceof GraphError && identity.reason.code === 190
      ? "Meta رفضت رمز الصفحة باعتباره غير صالح؛ أعد الربط." : "تعذر تأكيد هوية صفحة الإرسال.");
  }
  if (permissions.status === "fulfilled" && Array.isArray(permissions.value?.data)) {
    if (!permissions.value.data.some(row => row.permission === permission && row.status === "granted"))
      issues.push(`الحساب المتصل لم يمنح إذن ${permission}؛ راجع إعداد التطبيق ثم أعد الربط.`);
  } else {
    incomplete = true;
    issues.push("تعذر فحص أذونات الحساب المتصل.");
  }
  const status = issues.length ? incomplete ? "unknown" : "attention" : "healthy";
  return { status, checkedAt: new Date().toISOString(), issues: [...new Set(issues)],
    message: status === "healthy"
      ? "اجتاز رمز الصفحة فحص الصلاحية والهوية وإذن المراسلة. يبقى الإرسال خاضعاً لاعتماد التطبيق وإتاحة المحادثة لدى Meta."
      : "يحتاج اتصال المراسلة إلى مراجعة التفاصيل التالية. لا تُعِد إرسال الرسالة تلقائياً." };
}
