"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import {
  getAllAdAccounts,
  getAccountInsight,
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
