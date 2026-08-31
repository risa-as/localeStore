"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import {
  getAllAdAccounts,
  getAccountInsight,
  setAdRunning,
  setCampaignRunning,
  type AdInsightsResult,
  type InsightsPeriod,
} from "@/lib/meta/insights";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
}

/**
 * أداء الإعلانات عبر كل الحسابات الإعلانية للفترة المختارة.
 * activeOnly: يقصر القائمة على الحسابات التي فيها إعلانات نشطة الآن، وإعلاناتها
 * على النشطة فقط. (لا يُطبَّق على ملخّص الحساب — فهو تاريخي للفترة.)
 */
export async function getAdInsights(input: {
  datePreset?: string;
  since?: string;
  until?: string;
  activeOnly: boolean;
}): Promise<AdInsightsResult> {
  await requireAdmin();
  const empty = {
    accounts: [],
    totals: {
      spend: 0,
      purchases: 0,
      messages: 0,
      currency: null,
      accountsShown: 0,
      accountsTotal: 0,
    },
    generatedAt: new Date().toISOString(),
  };

  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { ok: false, message: "لا يوجد اتصال بـ Meta", activeOnly: input.activeOnly, ...empty };

  const token = conn.userAccessToken;
  const period: InsightsPeriod = {
    datePreset: input.datePreset,
    since: input.since,
    until: input.until,
  };

  let accounts;
  try {
    accounts = await getAllAdAccounts(token);
  } catch (e) {
    return {
      ok: false,
      message: `تعذّر جلب الحسابات الإعلانية: ${(e as Error).message}`,
      activeOnly: input.activeOnly,
      ...empty,
    };
  }

  const rows = await Promise.all(
    accounts.map((acc) => getAccountInsight(acc, token, period, input.activeOnly)),
  );

  // إثراء الحملات بالمنتج المرتبط (ربط يدوي CampaignProductMap أو إطلاقات النظام
  // عبر destinationUrl/SocialPost) — لرؤية ROI لكل حملة-منتج في تبويب الأداء.
  let campaignProducts: Map<string, { name: string; auto: boolean }> | null = null;
  try {
    const { buildCampaignProductMap } = await import("@/lib/meta/adspend");
    const resolve = await buildCampaignProductMap();
    const ids = [...new Set([...resolve.values()].map((v) => v.productId))];
    const prods = ids.length
      ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(prods.map((p) => [p.id, p.name]));
    const manualIds = new Set(
      (await prisma.campaignProductMap.findMany({ select: { campaignId: true } })).map((m) => m.campaignId),
    );
    campaignProducts = new Map();
    for (const [campaignId, v] of resolve) {
      const name = nameOf.get(v.productId);
      if (name)
        campaignProducts.set(campaignId, { name, auto: !manualIds.has(campaignId) });
    }
  } catch {
    campaignProducts = null; // الفشل غير حاجز — الأداء يعمل بلا أسماء المنتجات
  }
  if (campaignProducts) {
    for (const acc of rows) {
      for (const camp of acc.campaigns) {
        const p = campaignProducts.get(camp.id);
        if (p) {
          camp.productName = p.name;
          camp.productAuto = p.auto;
        }
      }
    }
  }

  const visible = input.activeOnly
    ? rows.filter((r) => r.activeCount > 0)
    : rows;
  // الحسابات ذات الأسماء العربية تأتي في النهاية، ثم ترتيب أبجدي داخل كل مجموعة
  // (مع وعي بالأرقام: A2 قبل A10).
  const arabicLast = (name: string) =>
    /[؀-ۿ]/.test(name.trim().charAt(0)) ? 1 : 0;
  visible.sort(
    (a, b) =>
      arabicLast(a.name) - arabicLast(b.name) ||
      a.name.localeCompare(b.name, "ar", { numeric: true, sensitivity: "base" }),
  );

  const currencies = new Set(visible.map((r) => r.currency));
  const currency = currencies.size === 1 ? [...currencies][0] : null;

  return {
    ok: true,
    activeOnly: input.activeOnly,
    accounts: visible,
    totals: {
      spend: visible.reduce((s, r) => s + r.spend, 0),
      purchases: visible.reduce((s, r) => s + r.purchase.count, 0),
      messages: visible.reduce((s, r) => s + r.message.count, 0),
      currency,
      accountsShown: visible.length,
      accountsTotal: rows.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * تشغيل/إطفاء حملة إعلانية كاملة من لوحة الأداء.
 * - التشغيل: يفعّل الحملة ثم مجموعاتها وإعلاناتها (المطلوب لكون إعلانات النظام
 *   تُنشأ والسلسلة كلها موقوفة) — تخطي المرفوض/قيد المراجعة.
 * - الإطفاء: يوقف الحملة فقط، فيتوقف عرض كل إعلاناتها دفعة واحدة.
 */
export async function setCampaignActive(
  campaignId: string,
  active: boolean,
): Promise<{ success: boolean; message: string; status?: string }> {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { success: false, message: "لا يوجد اتصال بـ Meta" };
  try {
    const status = await setCampaignRunning(
      campaignId,
      conn.userAccessToken,
      active,
    );
    if (!active)
      return {
        success: true,
        status: "CAMPAIGN_PAUSED",
        message: "أُوقفت الحملة — توقف عرض كل إعلاناتها.",
      };
    const problem = ["DISAPPROVED", "WITH_ISSUES", "PENDING_REVIEW"].includes(
      status,
    );
    const PROB_AR: Record<string, string> = {
      DISAPPROVED: "مرفوضة",
      WITH_ISSUES: "بها مشكلة",
      PENDING_REVIEW: "قيد المراجعة",
    };
    return {
      success: true,
      status: status === "IN_PROCESS" ? "ACTIVE" : status,
      message: problem
        ? `فُعّلت الحملة لكن حالتها: ${PROB_AR[status]}.`
        : "فُعّلت الحملة مع مجموعاتها وإعلاناتها — بدأ العرض والصرف.",
    };
  } catch (e) {
    return {
      success: false,
      message: `تعذّر تغيير حالة الحملة: ${(e as Error).message}`,
    };
  }
}
/**
 * تشغيل/إطفاء إعلان مباشرةً. التشغيل يفعّل الحملة والمجموعة والإعلان (فيبدأ العرض
 * والصرف الفعلي)؛ الإطفاء يوقف الإعلان فقط.
 */
export async function setAdActive(
  adId: string,
  active: boolean,
): Promise<{ success: boolean; message: string; status?: string }> {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { success: false, message: "لا يوجد اتصال بـ Meta" };
  try {
    const status = await setAdRunning(adId, conn.userAccessToken, active);
    // الإطفاء: نعرف أنه أُوقف (قد تُرجع Meta IN_PROCESS لحظياً). التشغيل:
    // IN_PROCESS يعني «قيد المعالجة» بعد التفعيل — نعامله كنشط؛ ونُبرز المشاكل فقط.
    if (!active)
      return { success: true, status: "PAUSED", message: "تم إيقاف الإعلان." };
    const problem = ["DISAPPROVED", "WITH_ISSUES", "PENDING_REVIEW"].includes(
      status,
    );
    const PROB_AR: Record<string, string> = {
      DISAPPROVED: "مرفوض",
      WITH_ISSUES: "به مشكلة",
      PENDING_REVIEW: "قيد المراجعة",
    };
    return {
      success: true,
      status: status === "IN_PROCESS" ? "ACTIVE" : status,
      message: problem
        ? `فُعّل الإعلان لكن حالته: ${PROB_AR[status]}.`
        : "تم تشغيل الإعلان — سيبدأ العرض والصرف.",
    };
  } catch (e) {
    return {
      success: false,
      message: `تعذّر تغيير حالة الإعلان: ${(e as Error).message}`,
    };
  }
}
