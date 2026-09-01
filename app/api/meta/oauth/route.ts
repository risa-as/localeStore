import { auth } from "@/auth";
import {
  getMetaConfig,
  getRedirectUri,
  signOAuthState,
  META_SCOPES,
  META_GRAPH_VERSION,
} from "@/lib/meta/config";

/**
 * بدء تسجيل الدخول بفيسبوك: يبني رابط حوار OAuth ويحوّل المشرف إليه.
 *
 * مقيّد بالمشرف: الـ callback يكتب صف MetaConnection المشترك، فلا يُسمح لغير
 * المشرف ببدء العملية. قيمة state موقّعة ومربوطة بجلسة هذا المشرف.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const config = getMetaConfig();
  if (!config) {
    return new Response("Meta not configured", { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = getRedirectUri(origin);

  // META_OAUTH_REDIRECT يتجاوز أصل الطلب. إن اختلف نطاقه عن النطاق الذي يتصفّحه
  // المشرف (مثل apex مقابل www) فسيرفض فيسبوك الحوار برسالة عامة، وحتى لو قَبِله
  // فقد لا تُرسَل كوكي الجلسة إلى نطاق الـ callback فيفشل بـ 401. نكشفه هنا
  // برسالة واضحة بدل تركه يظهر كخطأ غامض من فيسبوك.
  if (new URL(redirectUri).origin !== origin) {
    return Response.redirect(
      `${origin}/ar/admin/marketing?meta=redirect_mismatch`,
      302,
    );
  }
  const state = signOAuthState(session.user.id as string);

  const dialog = new URL(
    `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
  );
  dialog.searchParams.set("client_id", config.appId);
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("state", state);
  dialog.searchParams.set("response_type", "code");
  dialog.searchParams.set("scope", META_SCOPES.join(","));
  // يُجبر فيسبوك على إعادة عرض شاشة الموافقة وطلب الصلاحيات غير الممنوحة —
  // بدونه، إن كان التطبيق مُصرّحاً سابقاً يعيد توكناً دون منح الصلاحيات الجديدة.
  dialog.searchParams.set("auth_type", "rerequest");

  return Response.redirect(dialog.toString(), 302);
}
