"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import {
  syncSpendForDate,
  yesterdayBaghdad,
  buildCampaignProductMap,
  toBaghdadDateStr,
  listAdAccounts,
  fetchCampaignSpendForRange,
} from "@/lib/meta/adspend";

export type AdAccountOption = {
  id: string; // act_XXXX
  accountId: string; // 126126...
  name: string;
  currency: string;
  active: boolean; // account_status === 1
};

/** قائمة حسابات Meta الإعلانية — لاختيار الحسابات في قسم «حملات فترة محددة». */
export async function getAdAccountsList(): Promise<{
  ok: boolean;
  accounts: AdAccountOption[];
  message?: string;
}> {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { ok: false, accounts: [], message: "لا يوجد اتصال بـ Meta" };
  try {
    const accounts = await listAdAccounts(conn.userAccessToken);
    return {
      ok: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        accountId: a.accountId,
        name: a.name ?? a.accountId,
        currency: a.currency,
        active: a.status === 1,
      })),
    };
  } catch (e) {
    return { ok: false, accounts: [], message: (e as Error).message };
  }
}

/** مدقق أدمن مشترك. */
async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
}

function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/* ─── سعر الصرف: فترات زمنية مع كشف تعارض احترافي ─────────────────────────── */

export type FxRateRow = {
  id: string;
  rate: number;
  fromDate: string;
  toDate: string | null;
  note: string | null;
  /** أيام الصرف المستوردة التي طُبِّق عليها هذا السعر فعلياً. */
  appliedDays: number;
  /** إجمالي الدولار الذي حُوِّل بهذا السعر. */
  appliedUsd: number;
};

export async function getFxRates(): Promise<FxRateRow[]> {
  await requireAdmin();
  const rows = await prisma.fxRate.findMany({ orderBy: { fromDate: "desc" } });
  const spends = await prisma.adSpendDaily.groupBy({
    by: ["fxRate"],
    _count: { _all: true },
    _sum: { amount: true },
  });
  const byRate = new Map(spends.map((s) => [Number(s.fxRate), { days: s._count._all, usd: Number(s._sum.amount ?? 0) }]));
  return rows.map((r) => ({
    id: r.id,
    rate: Number(r.rate),
    fromDate: r.fromDate.toISOString().slice(0, 10),
    toDate: r.toDate ? r.toDate.toISOString().slice(0, 10) : null,
    note: r.note,
    appliedDays: byRate.get(Number(r.rate))?.days ?? 0,
    appliedUsd: byRate.get(Number(r.rate))?.usd ?? 0,
  }));
}

/** السعر الساري حالياً (أو آخر سعر مسجّل) لبطاقة العرض. */
export async function getCurrentFx(): Promise<{ rate: number | null; fromDate: string | null }> {
  await requireAdmin();
  const today = dayStart(new Date());
  const open = await prisma.fxRate.findFirst({
    where: { fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gt: today } }] },
    orderBy: { fromDate: "desc" },
  });
  if (open) return { rate: Number(open.rate), fromDate: open.fromDate.toISOString().slice(0, 10) };
  const last = await prisma.fxRate.findFirst({ orderBy: { fromDate: "desc" } });
  return last
    ? { rate: Number(last.rate), fromDate: last.fromDate.toISOString().slice(0, 10) }
    : { rate: null, fromDate: null };
}

export type FxOverlap = {
  id: string;
  rate: number;
  fromDate: string;
  toDate: string | null;
  overlapDays: number;
  overlapUsd: number; // إجمالي الصرف المستورد في أيام التقاطع
  overlapIQD: number; // قيمته الحالية بالدينار (بسعره المخزّن)
  newIQD: number; // قيمته لو طُبِّق السعر الجديد
  diffIQD: number; // الفرق (موجب = زيادة)
};

/** يفحص تقاطع فترة جديدة مع فترات موجودة بسعر مختلف — يرجع تفصيل الأثر. */
export async function checkFxOverlap(input: {
  rate: number;
  fromDate: string;
  toDate?: string | null;
}): Promise<{ overlaps: FxOverlap[]; totalDiffIQD: number }> {
  await requireAdmin();
  const from = dayStart(new Date(`${input.fromDate}T00:00:00.000Z`));
  const to = input.toDate ? dayStart(new Date(`${input.toDate}T00:00:00.000Z`)) : null;

  const existing = await prisma.fxRate.findMany({
    where: {
      rate: { not: input.rate },
      OR: [
        { toDate: null, fromDate: { lte: to ?? new Date("9999-12-31") } },
        { toDate: { gte: from } },
      ],
      fromDate: { lte: to ?? new Date("9999-12-31") },
    },
  });

  const overlaps: FxOverlap[] = [];
  for (const ex of existing) {
    const exFrom = dayStart(ex.fromDate);
    const exTo = ex.toDate ? dayStart(ex.toDate) : null;
    const oFrom = exFrom > from ? exFrom : from;
    const oTo = exTo && (to === null || exTo < to) ? exTo : to === null ? exTo : to;
    if (!oTo || oFrom > oTo) continue;
    const days = Math.round((oTo.getTime() - oFrom.getTime()) / 86400000) + 1;

    // الصرف المستورد في أيام التقاطع (كل صفوف نطاق التقاطع بسعر المخزّن)
    const agg = await prisma.adSpendDaily.aggregate({
      where: { date: { gte: oFrom, lte: oTo } },
      _sum: { amount: true, amountIQD: true },
      _count: { _all: true },
    });
    const usd = Number(agg._sum.amount ?? 0);
    const iqd = Number(agg._sum.amountIQD ?? 0);
    overlaps.push({
      id: ex.id,
      rate: Number(ex.rate),
      fromDate: exFrom.toISOString().slice(0, 10),
      toDate: exTo ? exTo.toISOString().slice(0, 10) : null,
      overlapDays: days,
      overlapUsd: usd,
      overlapIQD: iqd,
      newIQD: usd * input.rate,
      diffIQD: usd * input.rate - iqd,
    });
  }
  return {
    overlaps,
    totalDiffIQD: overlaps.reduce((s, o) => s + o.diffIQD, 0),
  };
}

/** حفظ فترة سعر. revalue: إعادة تقييم الصفوف المستوردة في التقاطع بالسعر الجديد. */
export async function saveFxRate(input: {
  rate: number;
  fromDate: string;
  toDate?: string | null;
  note?: string | null;
  revalue?: boolean;
}): Promise<{ success: boolean; message: string; revaluedRows?: number }> {
  await requireAdmin();
  try {
    if (!(input.rate > 0)) return { success: false, message: "أدخل سعراً صحيحاً" };
    const from = dayStart(new Date(`${input.fromDate}T00:00:00.000Z`));
    const to = input.toDate ? dayStart(new Date(`${input.toDate}T00:00:00.000Z`)) : null;
    if (to && to < from) return { success: false, message: "تاريخ النهاية قبل البداية" };

    let revaluedRows = 0;

    // إعادة التقييم الصريحة: صفوف المستورد داخل الفترة الجديدة تُحدَّث بالسعر الجديد.
    if (input.revalue) {
      const rows = await prisma.adSpendDaily.findMany({
        where: { date: { gte: from, lte: to ?? new Date("9999-12-31") } },
        select: { id: true, amount: true },
      });
      for (const row of rows) {
        await prisma.adSpendDaily.update({
          where: { id: row.id },
          data: { fxRate: input.rate, amountIQD: Number(row.amount) * input.rate },
        });
      }
      revaluedRows = rows.length;
    }

    await prisma.fxRate.create({
      data: {
        rate: input.rate,
        fromDate: from,
        toDate: to,
        note: input.note ?? null,
      },
    });
    revalidatePath("/admin/expenses");
    return {
      success: true,
      message: revaluedRows
        ? `حُفظ السعر وأُعيد تقييم ${revaluedRows} صف مستورد.`
        : "حُفظ سعر الصرف.",
      revaluedRows,
    };
  } catch (e) {
    return { success: false, message: `فشل حفظ السعر: ${(e as Error).message}` };
  }
}

/** حذف فترة سعر — يُمنع إن طُبِّق على صفوف مستوردة. */
export async function deleteFxRate(id: string): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  try {
    const rate = await prisma.fxRate.findUnique({ where: { id } });
    if (!rate) return { success: false, message: "السعر غير موجود" };
    const used = await prisma.adSpendDaily.count({
      where: { fxRate: Number(rate.rate) },
    });
    if (used > 0)
      return {
        success: false,
        message: `لا يمكن الحذف: السعر مطبَّق على ${used} صف مستورد. أنشئ فترة بديلة ثم أعد التقييم.`,
      };
    await prisma.fxRate.delete({ where: { id } });
    revalidatePath("/admin/expenses");
    return { success: true, message: "حُذفت الفترة." };
  } catch (e) {
    return { success: false, message: `فشل الحذف: ${(e as Error).message}` };
  }
}

/* ─── جلب حملات فترة محددة من Meta (استعلام حي عند الطلب) ─────────────────── */

export type PeriodCampaign = {
  campaignId: string;
  campaignName: string | null;
  /** إجمالي صرف الفترة بالدولار (عملة الحساب الإعلاني). */
  usd: number;
  /** الحساب (أو الحسابات) المالكة لهذه الحملة — للعرض الواضح في الجدول. */
  accountNames: string[];
  linked: boolean;
  productId: string | null;
  productName: string | null;
  /** ربط تلقائي (من إطلاقات النظام) أم يدوي مخزّن؟ */
  auto: boolean;
};

/**
 * كل الحملات التي لها صرف ضمن [from, to] عبر كل الحسابات — نداء واحد لكل حساب
 * (time_range مجمّع). مع كل حملة: حالتها (مرتبطة/غير مرتبطة) واسم المنتج.
 * استعلام حي فقط — لا يخزّن شيئاً.
 */
export async function getPeriodCampaigns(input: {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  /** اختياري: قصر الجلب على هذه الحسابات — فارغ/غير مرسل = كل الحسابات النشطة. */
  accountIds?: string[];
}): Promise<{ ok: boolean; campaigns: PeriodCampaign[]; message?: string }> {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { ok: false, campaigns: [], message: "لا يوجد اتصال بـ Meta — اتصل من تبويب التسويق أولاً" };

  // ±أيام صغيرة تضمن تغطية حدود الأيام كاملة في حسابات بتوقيتات مختلفة.
  const from = new Date(`${input.from}T00:00:00.000Z`);
  const to = new Date(`${input.to}T00:00:00.000Z`);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to)
    return { ok: false, campaigns: [], message: "فترة غير صالحة" };

  const spend = new Map<string, number>();
  const names = new Map<string, string | null>();
  /** حسابات كل حملة (قد تظهر الحملة بأسماء متشابهة في أكثر من حساب). */
  const campaignAccounts = new Map<string, Set<string>>();
  const accName = new Map<string, string>();
  let accountsErr = 0;
  let lastError: string | undefined;

  try {
    let accounts = await listAdAccounts(conn.userAccessToken);
    if (input.accountIds && input.accountIds.length > 0) {
      const wanted = new Set(input.accountIds);
      accounts = accounts.filter((a) => wanted.has(a.id) || wanted.has(a.accountId));
    }
    for (const acc of accounts) {
      if (acc.status !== 1) continue;
      accName.set(acc.id, acc.name ?? acc.accountId);
      try {
        const rows = await fetchCampaignSpendForRange(
          acc.id,
          conn.userAccessToken,
          input.from,
          input.to,
        );
        for (const r of rows) {
          spend.set(r.campaignId, (spend.get(r.campaignId) ?? 0) + r.spend);
          names.set(r.campaignId, r.campaignName);
          const set = campaignAccounts.get(r.campaignId) ?? new Set<string>();
          set.add(acc.name ?? acc.accountId);
          campaignAccounts.set(r.campaignId, set);
        }
      } catch (e) {
        accountsErr += 1;
        lastError = (e as Error).message;
      }
    }
  } catch (e) {
    return { ok: false, campaigns: [], message: `فشل الاتصال بـ Meta: ${(e as Error).message}` };
  }

  const resolve = await buildCampaignProductMap();
  // تمييز الربط التلقائي (إطلاقات النظام) عن اليدوي المخزّن — للعرض فقط.
  const manualRows = await prisma.campaignProductMap.findMany({ select: { campaignId: true } });
  const manualIds = new Set(manualRows.map((m) => m.campaignId));
  const productIds = [...new Set([...resolve.values()].map((v) => v.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      })
    : [];
  const productName = new Map(products.map((p) => [p.id, p.name]));

  const out: PeriodCampaign[] = [];
  for (const [campaignId, total] of spend) {
    if (!(total > 0)) continue;
    const linked = resolve.get(campaignId);
    out.push({
      campaignId,
      campaignName: names.get(campaignId) ?? linked?.campaignName ?? null,
      usd: total,
      accountNames: [...(campaignAccounts.get(campaignId) ?? [])],
      linked: !!linked,
      productId: linked?.productId ?? null,
      productName: linked ? productName.get(linked.productId) ?? null : null,
      auto: !!linked && !manualIds.has(campaignId),
    });
  }
  out.sort((a, b) => b.usd - a.usd);

  return {
    ok: accountsErr === 0,
    campaigns: out,
    message:
      accountsErr > 0
        ? `فشل جلب ${accountsErr} حساب${lastError ? `: ${lastError}` : ""}`
        : undefined,
  };
}

/* ─── الربط: جماعي (بضغطة واحدة) ──────────────────────────────────────────── */

export type BulkLinkEntry = { campaignId: string; campaignName?: string | null; productId: string };
export type BulkLinkResult = {
  success: boolean;
  linked: number;
  failed: number;
  message: string;
};

/** ربط عدة حملات بمنتجاتها في معاملة واحدة — زر «ربط الحملات المحددة». */
export async function linkCampaignsBulk(entries: BulkLinkEntry[]): Promise<BulkLinkResult> {
  await requireAdmin();
  if (!entries.length)
    return { success: false, linked: 0, failed: 0, message: "لا توجد حملات محددة" };

  // التحقق من المنتجات أولاً (وجود + عدد)
  const ids = [...new Set(entries.map((e) => e.productId))];
  const found = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundSet = new Set(found.map((p) => p.id));
  const valid = entries.filter((e) => foundSet.has(e.productId));
  if (valid.length === 0)
    return { success: false, linked: 0, failed: entries.length, message: "لا يوجد منتج صالح في التحديد" };

  let linked = 0;
  let failed = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const e of valid) {
        try {
          await tx.campaignProductMap.upsert({
            where: { campaignId: e.campaignId },
            create: { campaignId: e.campaignId, productId: e.productId, campaignName: e.campaignName ?? null },
            update: { productId: e.productId, campaignName: e.campaignName ?? null },
          });
          linked += 1;
        } catch {
          failed += 1;
        }
      }
    });
  } catch {
    // المعاملة فشلت كلياً — نُعيد المحاولة صفّاً صفّاً كي لا نخسر الكل بخطأ واحد.
    linked = 0;
    failed = 0;
    for (const e of valid) {
      try {
        await prisma.campaignProductMap.upsert({
          where: { campaignId: e.campaignId },
          create: { campaignId: e.campaignId, productId: e.productId, campaignName: e.campaignName ?? null },
          update: { productId: e.productId, campaignName: e.campaignName ?? null },
        });
        linked += 1;
      } catch {
        failed += 1;
      }
    }
  }

  failed += entries.length - valid.length; // المنتجات غير الصالحة
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/marketing");

  return {
    success: linked > 0,
    linked,
    failed,
    message:
      `رُبطت ${linked} حملة بالمنتجات.` +
      (failed > 0 ? ` فشل ${failed} — تأكد من اختيار منتج لكل صف ثم أعد المحاولة.` : ""),
  };
}

/* ─── الاسترجاع: استيراد صرف فترة كاملة بأثر رجعي (زر منفصل) ──────────────── */

export type BackfillResult = {
  success: boolean;
  message: string;
  days: number;
  rows: number;
  skippedNoFx: number;
};

/**
 * استيراد صرف كل أيام الفترة (بما فيها اليوم الحالي) يوماً بيوم، يخزّن صفوف
 * الحملات المرتبطة فقط (نفس منطق المزامنة اليومية). آمن للتكرار (upsert).
 * حد أقصى 92 يوماً حماية من النداءات المفرطة.
 */
export async function importPeriodSpend(input: {
  from: string;
  to: string;
  /** اختياري: قصر الاسترجاع على هذه الحسابات — فارغ = كل الحسابات النشطة. */
  accountIds?: string[];
}): Promise<BackfillResult> {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { success: false, message: "لا يوجد اتصال بـ Meta", days: 0, rows: 0, skippedNoFx: 0 };
  const fx = await getCurrentFx();
  if (fx.rate == null)
    return {
      success: false,
      message: "أدخل سعر صرف الدولار أولاً — لا يمكن التحويل بدونه",
      days: 0,
      rows: 0,
      skippedNoFx: 0,
    };

  const from = dayStart(new Date(`${input.from}T00:00:00.000Z`));
  const to = dayStart(new Date(`${input.to}T00:00:00.000Z`));
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to)
    return { success: false, message: "فترة غير صالحة", days: 0, rows: 0, skippedNoFx: 0 };
  // حتى 92 يوماً (ربع سنوي) — أيام الفترة تُجلب تباعاً بنداء واحد لكل حساب يومياً.
  if (to.getTime() - from.getTime() > 91 * 86400000)
    return {
      success: false,
      message: "الحد الأقصى للفترة 92 يوماً — قسّم الفترة إلى أجزاء أصغر",
      days: 0,
      rows: 0,
      skippedNoFx: 0,
    };

  let rows = 0;
  let days = 0;
  let skippedNoFx = 0;
  let accountsErr = 0;
  let lastError: string | undefined;

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = await syncSpendForDate(conn.userAccessToken, d, {
      log: false,
      accountIds: input.accountIds,
    });
    rows += r.rows;
    days += 1;
    skippedNoFx += r.skippedNoFx;
    accountsErr += r.accountsErr;
    if (!r.ok) lastError = r.message;
  }

  revalidatePath("/admin/expenses");

  return {
    success: rows > 0 || accountsErr === 0,
    message:
      `استُرجع صرف ${days} يوم: ${rows} صف مخزّن` +
      (skippedNoFx ? ` — ${skippedNoFx} صف بلا سعر صرف (تخطّاه)` : "") +
      (accountsErr ? ` — فشل ${accountsErr} حساب/يوم${lastError ? `: ${lastError}` : ""}` : ""),
    days,
    rows,
    skippedNoFx,
  };
}

/* ─── المزامنة اليدوية ────────────────────────────────────────────────────── */

export async function getLastSync(): Promise<{
  date: string | null;
  ok: boolean;
  accountsOk: number;
  accountsErr: number;
  rows: number;
  unlinked: number;
  message: string | null;
  ranAt: string | null;
}> {
  await requireAdmin();
  const last = await prisma.adSpendSyncLog.findFirst({ orderBy: { createdAt: "desc" } });
  return last
    ? {
        date: toBaghdadDateStr(last.date),
        ok: last.ok,
        accountsOk: last.accountsOk,
        accountsErr: last.accountsErr,
        rows: last.rows,
        unlinked: last.unlinked,
        message: last.message,
        ranAt: last.createdAt.toISOString(),
      }
    : { date: null, ok: true, accountsOk: 0, accountsErr: 0, rows: 0, unlinked: 0, message: null, ranAt: null };
}

/** مزامنة يدوية ليوم محدد — افتراضياً يوم أمس (يخزّن، على عكس getPeriodCampaigns). */
export async function syncAdSpendOnDate(dateStr?: string): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken)
    return { success: false, message: "لا يوجد اتصال بـ Meta" };
  const fx = await getCurrentFx();
  if (fx.rate == null)
    return { success: false, message: "أدخل سعر صرف الدولار أولاً — لا يمكن تحويل الصرف بدونه" };
  const day = dateStr ? dayStart(new Date(`${dateStr}T00:00:00.000Z`)) : yesterdayBaghdad();
  if (isNaN(day.getTime())) return { success: false, message: "تاريخ غير صالح" };
  const r = await syncSpendForDate(conn.userAccessToken, day);
  revalidatePath("/admin/expenses");
  return {
    success: r.ok,
    message: r.ok
      ? `مزامنة ${r.date}: ${r.rows} صف من ${r.accountsOk} حساب` +
        (r.unlinked ? ` — ${r.unlinked} حملة بلا منتج (استخدم «جلب الحملات» لربطها)` : "") +
        (r.skippedNoFx ? ` — ${r.skippedNoFx} صف بلا سعر صرف` : "")
      : `فشلت مزامنة ${r.accountsErr} حساب: ${r.message ?? ""}`,
  };
}

/* ─── الجدول الموحّد: الإدخال اليدوي + الصرف المستورد من Meta ─────────────── */

export type UnifiedCampaignRow = {
  id: string; // id فريد للصف
  productId: string;
  productName: string;
  from: string;
  to: string;
  /** المبلغ الأصلي (عملة الإدخال أو عملة الحساب الإعلاني). */
  amount: number;
  currency: string;
  /** المكافئ بالدينار (للمستورد من مخزّن amountIQD؛ لليدوي كما أُدخل). */
  amountIQD: number;
  source: "manual" | "meta";
  /** للصف اليدوي: id سجل AdCampaign الأصلي (للتعديل/الحذف). */
  refId?: string | null;
  campaigns: number; // للمستورد: عدد الحملات
  days: number; // للمستورد: عدد الأيام
};

/** صفوف موحّدة: الإدخالات اليدوية (AdCampaign) + المستورد المجمّع لكل (منتج، حملة). */
export async function getUnifiedCampaignRows(from: Date, to: Date): Promise<{
  rows: UnifiedCampaignRow[];
  totalIQD: number;
  totalUSD: number;
}> {
  await requireAdmin();
  const f = dayStart(from);
  const t = dayStart(to);

  const [campaignsRaw, importedRows] = await Promise.all([
    prisma.adCampaign.findMany({
      where: { fromDate: { lte: t }, toDate: { gte: f } },
      include: { product: { select: { name: true } } },
      orderBy: { fromDate: "desc" },
    }),
    prisma.adSpendDaily.findMany({
      where: { date: { gte: f, lte: t } },
      orderBy: [{ date: "asc" }],
    }),
  ]);

  const rows: UnifiedCampaignRow[] = [];
  let totalIQD = 0;
  let totalUSD = 0;

  // 1) اليدوي (كما أُدخل — يُعرض بالمبلغ والعملة الأصليين).
  for (const c of campaignsRaw) {
    const amount = Number(c.amount);
    // الإدخال اليدوي يُخزَّن بالألف د.ع (يطابق عرض ×1000 في الواجهة القديمة).
    const iqd = c.currency === "IQD" ? amount * 1000 : amount;
    rows.push({
      id: `manual-${c.id}`,
      productId: c.productId,
      productName: c.product.name,
      from: c.fromDate.toISOString().slice(0, 10),
      to: c.toDate.toISOString().slice(0, 10),
      amount,
      currency: c.currency,
      amountIQD: iqd,
      source: "manual",
      refId: c.id,
      campaigns: 1,
      days: 1,
    });
    totalIQD += iqd;
    if (c.currency === "USD") totalUSD += amount;
  }

  // 2) المستورد من Meta — مجمّع لكل (منتج، حملة) داخل الفترة.
  //    صفوف «غير مصنّف» (الحاضن) تُجمع أيضاً — منتج اسمه يشرح نفسه في الجدول.
  const agg = new Map<
    string,
    { productId: string; campaignId: string; campaignName: string | null; usd: number; iqd: number; days: Set<string>; currency: string }
  >();
  for (const r of importedRows) {
    const key = `${r.productId}:${r.campaignId}`;
    let g = agg.get(key);
    if (!g) {
      g = {
        productId: r.productId,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        usd: 0,
        iqd: 0,
        days: new Set<string>(),
        currency: r.currency,
      };
      agg.set(key, g);
    }
    g.usd += Number(r.amount);
    g.iqd += Number(r.amountIQD);
    g.days.add(r.date.toISOString().slice(0, 10));
  }
  const productIds = [...new Set([...agg.values()].map((g) => g.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      })
    : [];
  const productName = new Map(products.map((p) => [p.id, p.name]));

  for (const g of agg.values()) {
    rows.push({
      id: `meta-${g.productId}-${g.campaignId}`,
      productId: g.productId,
      productName: productName.get(g.productId) ?? "منتج",
      from: [...g.days].sort()[0],
      to: [...g.days].sort()[g.days.size - 1],
      amount: g.usd,
      currency: g.currency,
      amountIQD: g.iqd,
      source: "meta",
      campaigns: 1,
      days: g.days.size,
    });
    totalIQD += g.iqd;
    totalUSD += g.usd;
  }

  // اليدوي أولاً ثم المستورد، كلاهما بالتاريخ الأحدث أولاً.
  rows.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));

  return { rows, totalIQD, totalUSD };
}

/* ─── تفصيل حملات المنتج (لصفحة الأرباح) ─────────────────────────────────── */

export type ProductCampaignRow = {
  campaignId: string;
  campaignName: string;
  /** بوحدة الألف د.ع — نفس وحدة بقية أرقام صفحة الأرباح. */
  amount: number;
  days: number;
};

/**
 * صرف كل حملة مجمّعاً حسب المنتج ضمن الفترة — ليُفتح تحت صف المنتج في صفحة
 * الأرباح فيُعرف أي حملة استهلكت المبلغ، بدل رقم إجمالي مبهم.
 * القسمة على 1000 تطابق وحدة «الألف د.ع» التي تعرضها formatCurrency.
 */
export async function getProductCampaignBreakdown(
  from: Date,
  to: Date,
): Promise<Record<string, ProductCampaignRow[]>> {
  await requireAdmin();
  const rows = await prisma.adSpendDaily.findMany({
    where: { date: { gte: from, lte: to } },
    select: {
      productId: true,
      campaignId: true,
      campaignName: true,
      amountIQD: true,
    },
  });

  const byProduct = new Map<string, Map<string, ProductCampaignRow>>();
  for (const r of rows) {
    let camps = byProduct.get(r.productId);
    if (!camps) {
      camps = new Map();
      byProduct.set(r.productId, camps);
    }
    const existing = camps.get(r.campaignId);
    const amount = Number(r.amountIQD) / 1000;
    if (existing) {
      existing.amount += amount;
      existing.days += 1;
    } else {
      camps.set(r.campaignId, {
        campaignId: r.campaignId,
        campaignName: r.campaignName ?? "حملة",
        amount,
        days: 1,
      });
    }
  }

  const out: Record<string, ProductCampaignRow[]> = {};
  for (const [productId, camps] of byProduct)
    out[productId] = [...camps.values()].sort((a, b) => b.amount - a.amount);
  return out;
}
