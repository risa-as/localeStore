"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { getMetaConfig, META_SCOPES } from "@/lib/meta/config";
import { graphGet } from "@/lib/meta/graph";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  return session;
}

type PageAsset = {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
};
type AdAsset = { id: string; account_id: string; name: string };

/**
 * حالة اتصال Meta لواجهة الإدارة — بلا أي توكنات.
 * `configured` تعني وجود متغيرات البيئة؛ `connected` تعني وجود توكن مستخدم فعّال.
 */
export async function getMetaStatus() {
  await requireAdmin();
  const configured = getMetaConfig() !== null;

  const conn = await prisma.metaConnection.findUnique({
    where: { id: "default" },
  });

  if (!conn || !conn.userAccessToken) {
    return { configured, connected: false as const };
  }

  const pages = (conn.pages as unknown as PageAsset[]) ?? [];
  const adAccounts = (conn.adAccounts as unknown as AdAsset[]) ?? [];

  return {
    configured,
    connected: true as const,
    fbUserName: conn.fbUserName,
    tokenExpires: conn.userTokenExpires?.toISOString() ?? null,
    // قوائم بلا توكنات — نكشف المعرّف والاسم فقط، ونشير لوجود إنستغرام.
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      igId: p.instagram_business_account?.id ?? null,
      igUsername: p.instagram_business_account?.username ?? null,
    })),
    adAccounts: adAccounts.map((a) => ({
      id: a.id,
      accountId: a.account_id,
      name: a.name,
    })),
    selected: {
      pageId: conn.selectedPageId,
      pageName: conn.selectedPageName,
      igId: conn.selectedIgId,
      igUsername: conn.selectedIgUsername,
      adAccountId: conn.selectedAdAccountId,
      adAccountName: conn.selectedAdAccountName,
    },
  };
}

/** اختيار الصفحة الفعّالة — يجلب توكنها وحساب إنستغرام المرتبط من القائمة المخزّنة. */
export async function selectMetaPage(pageId: string) {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({
    where: { id: "default" },
  });
  if (!conn) return { success: false, message: "لا يوجد اتصال" };

  const pages = (conn.pages as unknown as PageAsset[]) ?? [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { success: false, message: "الصفحة غير موجودة" };

  await prisma.metaConnection.update({
    where: { id: "default" },
    data: {
      selectedPageId: page.id,
      selectedPageName: page.name,
      selectedPageToken: page.access_token ?? null,
      selectedIgId: page.instagram_business_account?.id ?? null,
      selectedIgUsername: page.instagram_business_account?.username ?? null,
    },
  });
  revalidatePath("/admin/marketing");
  return { success: true, message: "تم اختيار الصفحة" };
}

export async function selectMetaAdAccount(adAccountId: string) {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({
    where: { id: "default" },
  });
  if (!conn) return { success: false, message: "لا يوجد اتصال" };

  const adAccounts = (conn.adAccounts as unknown as AdAsset[]) ?? [];
  const acc = adAccounts.find((a) => a.id === adAccountId);
  if (!acc) return { success: false, message: "الحساب الإعلاني غير موجود" };

  await prisma.metaConnection.update({
    where: { id: "default" },
    data: {
      selectedAdAccountId: acc.id,
      selectedAdAccountName: acc.name,
    },
  });
  revalidatePath("/admin/marketing");
  return { success: true, message: "تم اختيار الحساب الإعلاني" };
}

/**
 * يفحص الصلاحيات الممنوحة فعلياً للتوكن عبر /me/permissions، ويقارنها بالمطلوبة.
 * يشخّص أخطاء مثل «(#200) Permissions error» عند النشر: غالباً pages_manage_posts
 * لم تُمنح لأن الاتصال تم قبل إضافة الصلاحية، أو لم تُختر الصفحة أثناء الدخول.
 */
export async function checkMetaPermissions() {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({
    where: { id: "default" },
  });
  if (!conn?.userAccessToken)
    return { ok: false as const, message: "لا يوجد اتصال" };

  try {
    const res = await graphGet<{
      data: { permission: string; status: string }[];
    }>("me/permissions", conn.userAccessToken);
    const rows = res.data ?? [];
    const granted = new Set(
      rows.filter((r) => r.status === "granted").map((r) => r.permission),
    );
    const declined = rows
      .filter((r) => r.status === "declined")
      .map((r) => r.permission);
    // الصلاحيات المطلوبة غير الممنوحة (المفقودة أو المرفوضة).
    const missing = META_SCOPES.filter((s) => !granted.has(s));
    return {
      ok: true as const,
      granted: Array.from(granted),
      declined,
      missing,
    };
  } catch (err) {
    return { ok: false as const, message: (err as Error).message };
  }
}

/** قطع الاتصال — يمسح الصف بالكامل بما فيه التوكنات. */
export async function disconnectMeta() {
  await requireAdmin();
  await prisma.metaConnection
    .delete({ where: { id: "default" } })
    .catch(() => null);
  revalidatePath("/admin/marketing");
  return { success: true, message: "تم قطع الاتصال" };
}
