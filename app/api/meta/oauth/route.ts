import { requireAdministrator } from "@/lib/authorization";
import {
  getMetaConfig,
  getRedirectUri,
  signOAuthState,
} from "@/lib/meta/config";
import { buildMetaOAuthUrl } from "@/lib/meta/oauth";

/**
 * بدء تسجيل الدخول بفيسبوك: يبني رابط حوار OAuth ويحوّل المشرف إليه.
 *
 * مقيّد بالمشرف: الـ callback يكتب صف MetaConnection المشترك، فلا يُسمح لغير
 * المشرف ببدء العملية. قيمة state موقّعة ومربوطة بجلسة هذا المشرف.
 */
export async function GET(req: Request) {
  let session: Awaited<ReturnType<typeof requireAdministrator>>;
  try { session = await requireAdministrator(); } catch {
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

  const dialog = buildMetaOAuthUrl(config, redirectUri, state);

  return Response.redirect(dialog.toString(), 302);
}
