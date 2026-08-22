import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { getMetaConfig, getRedirectUri, verifyOAuthState } from "@/lib/meta/config";
import { oauthExchange, graphGet } from "@/lib/meta/graph";

/**
 * نهاية تسجيل الدخول: يبادل الـ code بتوكن طويل العمر، يكتشف الصفحات وحسابات
 * إنستغرام والحسابات الإعلانية، ويخزّنها في صف MetaConnection الوحيد.
 *
 * مقيّد بالمشرف + يتحقق من توقيع state المربوط بالجلسة قبل أي كتابة.
 */

function redirectTo(origin: string, status: string) {
  return Response.redirect(`${origin}/ar/admin/marketing?meta=${status}`, 302);
}

type FbPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const url = new URL(req.url);

  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const config = getMetaConfig();
  if (!config) return new Response("Meta not configured", { status: 503 });

  // المستخدم ألغى الحوار
  const error = url.searchParams.get("error");
  if (error) return redirectTo(origin, "cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectTo(origin, "invalid");

  if (!verifyOAuthState(state, session.user.id as string)) {
    return redirectTo(origin, "invalid");
  }

  try {
    const redirectUri = getRedirectUri(origin);

    // 1) code → توكن قصير العمر
    const short = await oauthExchange({
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: redirectUri,
      code,
    });

    // 2) قصير → طويل العمر (~60 يوماً)
    const long = await oauthExchange({
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: short.access_token,
    });

    const userToken = long.access_token;
    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : null;

    // 3) اكتشاف الأصول
    const me = await graphGet<{ id: string; name?: string }>("me", userToken, {
      fields: "id,name",
    });

    const pagesRes = await graphGet<{ data: FbPage[] }>("me/accounts", userToken, {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
    });
    const pages = pagesRes.data ?? [];

    const adRes = await graphGet<{
      data: { id: string; account_id: string; name: string }[];
    }>("me/adaccounts", userToken, {
      fields: "id,account_id,name",
      limit: "100",
    });
    const adAccounts = adRes.data ?? [];

    // اختيار افتراضي: أول صفحة / حساب إعلاني إن وُجد واحد فقط
    const firstPage = pages[0];
    const firstAd = adAccounts[0];

    const data = {
      fbUserId: me.id,
      fbUserName: me.name ?? null,
      userAccessToken: userToken,
      userTokenExpires: expiresAt,
      scopes: [],
      pages: pages as unknown as object,
      adAccounts: adAccounts as unknown as object,
      selectedPageId: firstPage?.id ?? null,
      selectedPageName: firstPage?.name ?? null,
      selectedPageToken: firstPage?.access_token ?? null,
      selectedIgId: firstPage?.instagram_business_account?.id ?? null,
      selectedIgUsername:
        firstPage?.instagram_business_account?.username ?? null,
      selectedAdAccountId: firstAd?.id ?? null,
      selectedAdAccountName: firstAd?.name ?? null,
    };

    await prisma.metaConnection.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });

    return redirectTo(origin, "connected");
  } catch (err) {
    console.error("❌ Meta OAuth callback error:", err);
    return redirectTo(origin, "failed");
  }
}
