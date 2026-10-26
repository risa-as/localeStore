import { graphGetAll } from "./graph";
import { prisma } from "@/db/prisma";
import { UNLINKED_AD_SPEND_SLUG } from "@/lib/constants/internal-products";
import { fxPeriodWhere } from "@/lib/fx-periods";
import { fxPeriodIncludes } from "@/lib/fx-periods";
import { persistDailySpend } from "./adspend-storage";

/**
 * طبقة تكامل الصرف الإعلاني:
 *  - حلّ المنتج لكل حملة (تلقائي من إطلاقات النظام، أو ربط يدوي مخزّن).
 *  - جلب صرف يوم محدد لكل الحسابات بنداء /insights واحد لكل حساب (level=campaign).
 *  - تخزين صف يومي لكل (منتج، حملة، يوم) مع سعر الصرف الساري.
 *  - كشف الإدخالات اليدوية المتقاطعة ووسمها «مُستبدَل تلقائياً» دون حذف.
 */

export type ResolveMap = Map<string, { productId: string; campaignName: string | null }>;

/**
 * منتج حاضن للصرف غير المرتبط (بند «غير مصنّف»). يُنشأ مرة واحدة عند الحاجة —
 * بهذا لا يضيع أي صرف فعلي من الحساب حتى لو كانت حملة بلا منتج، ويمكن لاحقاً
 * إعادة تصنيف صفوفه عند الربط اليدوي، دون إنشاء نسخة أخرى من صرف الحملة/اليوم.
 */
export const UNLINKED_PRODUCT_NAME = "غير مصنّف (حملات بلا ربط)";
// الـ slug مصدره ملف الثوابت المشترك — تستورده استعلامات المتجر لاستبعاده.

async function getOrCreateUnlinkedProduct(): Promise<string> {
  const existing = await prisma.product.findFirst({
    where: { name: UNLINKED_PRODUCT_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.product.create({
    data: {
      name: UNLINKED_PRODUCT_NAME,
      slug: UNLINKED_AD_SPEND_SLUG,
      stock: 0,
      price: 0,
      costPrice: 0,
      shippingPrice: 0,
      description: "بند تلقائي — صرف حملات Meta التي لم يُربط بأي منتج. عند الربط تنتقل أرقامه للمنتج الصحيح.",
    },
    select: { id: true },
  });
  return created.id;
}

/** يبني خريطة campaignId → منتج: أولاً من الربط اليدوي، ثم من إطلاقات النظام. */
export async function buildCampaignProductMap(): Promise<ResolveMap> {
  const map: ResolveMap = new Map();

  // 1) الربط اليدوي يفوز دائماً (قرار صريح من المالك).
  const manual = await prisma.campaignProductMap.findMany();
  for (const m of manual)
    map.set(m.campaignId, { productId: m.productId, campaignName: m.campaignName });

  // 2) إطلاقات النظام: destinationUrl يحتوي /landing/{slug} → المنتج.
  const launches = await prisma.metaAdLaunch.findMany({
    where: { campaignId: { not: null } },
    select: { campaignId: true, destinationUrl: true, postId: true },
  });
  const slugs = new Set<string>();
  for (const l of launches) {
    const m = l.destinationUrl?.match(/\/landing\/([a-z0-9-]+)/i);
    if (m) slugs.add(m[1].toLowerCase());
  }
  const products = slugs.size
    ? await prisma.product.findMany({
        where: { slug: { in: [...slugs] } },
        select: { id: true, slug: true },
      })
    : [];
  const bySlug = new Map(products.map((p) => [p.slug.toLowerCase(), p.id]));

  // منشورات النظام → المنتج (عبر SocialPost.productId) كخط ثالث للإطلاقات بلا رابط.
  const postIds = launches.filter((l) => l.postId).map((l) => l.postId as string);
  const posts = postIds.length
    ? await prisma.socialPost.findMany({
        where: { id: { in: postIds } },
        select: { id: true, productId: true },
      })
    : [];
  const postProduct = new Map(posts.map((p) => [p.id, p.productId]));

  for (const l of launches) {
    if (!l.campaignId || map.has(l.campaignId)) continue;
    const m = l.destinationUrl?.match(/\/landing\/([a-z0-9-]+)/i);
    const fromSlug = m ? bySlug.get(m[1].toLowerCase()) : null;
    const fromPost = l.postId ? postProduct.get(l.postId) : null;
    const productId = fromSlug ?? fromPost ?? null;
    if (productId) map.set(l.campaignId, { productId, campaignName: null });
  }
  return map;
}

/** حسابات Meta (المعرّف + الاسم + العملة + الحالة). */
export async function listAdAccounts(token: string) {
  const accounts = await graphGetAll<{
    id: string; account_id: string; name?: string; currency: string; account_status: number;
  }>("me/adaccounts", token, {
    fields: "name,account_id,currency,account_status",
    limit: "200",
  });
  return accounts.map((a) => ({
    id: a.id,
    accountId: a.account_id,
    name: a.name ?? null,
    currency: a.currency,
    status: a.account_status,
  }));
}

export type CampaignSpendRow = {
  campaignId: string;
  campaignName: string | null;
  spend: number; // بعملة الحساب
  /** الحساب المالك للإعلان — يُملأ من المستدعي (خريطة actId → اسم). */
  accountName?: string | null;
  accountId?: string;
};

/** صرف يوم محدد لكل حملات الحساب — نداء واحد. */
export async function fetchCampaignSpendForDate(
  actId: string,
  token: string,
  date: string, // YYYY-MM-DD
): Promise<CampaignSpendRow[]> {
  const data = await graphGetAll<{
    spend?: string; campaign_id?: string; campaign_name?: string;
  }>(`${actId}/insights`, token, {
    fields: "spend,campaign_id,campaign_name",
    level: "campaign",
    time_range: JSON.stringify({ since: date, until: date }),
    limit: "100",
  });
  return data
    .filter((r) => !!r.campaign_id)
    .map((r) => ({
      campaignId: r.campaign_id as string,
      campaignName: r.campaign_name ?? null,
      spend: Number(r.spend ?? 0),
    }));
}

/** صرف فترة كاملة (إجمالي مجمّع لكل حملة) — نداء واحد لكل حساب بدل نداء لكل يوم. */
export async function fetchCampaignSpendForRange(
  actId: string,
  token: string,
  from: string, // YYYY-MM-DD
  to: string, // YYYY-MM-DD
  /** اختياري: بيانات الحساب المالك لتوسيم الصفوف (الاسم يظهر في الجداول). */
  owner?: { accountName?: string | null; accountId?: string },
): Promise<CampaignSpendRow[]> {
  const data = await graphGetAll<{
    spend?: string; campaign_id?: string; campaign_name?: string;
  }>(`${actId}/insights`, token, {
    fields: "spend,campaign_id,campaign_name",
    level: "campaign",
    time_range: JSON.stringify({ since: from, until: to }),
    limit: "100",
  });
  return data
    .filter((r) => !!r.campaign_id)
    .map((r) => ({
      campaignId: r.campaign_id as string,
      campaignName: r.campaign_name ?? null,
      spend: Number(r.spend ?? 0),
      accountName: owner?.accountName ?? null,
      accountId: owner?.accountId ?? actId,
    }));
}

/** السعر الساري ليوم معيّن أو null إن لم تُغطَّ الفترة. */
export async function fxRateForDate(day: Date): Promise<{ rate: number; id: string } | null> {
  const open = await prisma.fxRate.findFirst({
    where: fxPeriodWhere(day),
    orderBy: { fromDate: "desc" },
  });
  if (open) return { rate: Number(open.rate), id: open.id };
  return null;
}

export type SyncResult = {
  ok: boolean;
  date: string;
  accountsOk: number;
  accountsErr: number;
  rows: number;
  unlinked: number;
  skippedNoFx: number;
  missingFx: { date: string; currency: string; amount: number; rows: number }[];
  message?: string;
};

/** Fetch the whole daily breakdown once per account, rather than once per account/day. */
export async function syncSpendForRange(token: string, from: string, to: string, opts?: { accountIds?: string[] }) {
  let accounts = (await listAdAccounts(token)).filter(account => account.status === 1);
  if (opts?.accountIds?.length) {
    const wanted = new Set(opts.accountIds);
    accounts = accounts.filter(account => wanted.has(account.id) || wanted.has(account.accountId));
  }
  const resolve = await buildCampaignProductMap();
  const rates = await prisma.fxRate.findMany({ orderBy: { fromDate: "desc" } });
  const observations: { account: typeof accounts[number]; campaignId: string; campaignName: string | null; date: string; amount: number }[] = [];
  const errors = new Map<string, string>();
  for (let offset = 0; offset < accounts.length; offset += 3) {
    await Promise.all(accounts.slice(offset, offset + 3).map(async account => {
      try {
        const daily = await graphGetAll<{ campaign_id?: string; campaign_name?: string; date_start: string; spend?: string }>(`${account.id}/insights`, token, {
          fields: "spend,campaign_id,campaign_name,date_start", level: "campaign", time_increment: "1",
          time_range: JSON.stringify({ since: from, until: to }), limit: "500",
        });
        for (const row of daily) {
          if (!row.campaign_id || !(Number(row.spend) > 0)) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date_start) || row.date_start < from || row.date_start > to) throw new Error("أعادت Meta تاريخ صرف خارج الفترة");
          observations.push({ account, campaignId: row.campaign_id, campaignName: row.campaign_name || null, date: row.date_start, amount: Number(row.spend) });
        }
      } catch (error) { errors.set(account.id, `${account.name || account.accountId}: ${(error as Error).message}`); }
    }));
  }
  const unlinkedProductId = observations.some(row => !resolve.has(row.campaignId)) ? await getOrCreateUnlinkedProduct() : null;
  let rows = 0, skippedNoFx = 0, unlinked = 0;
  const missing = new Map<string, { date: string; currency: string; amount: number; rows: number }>();
  for (let offset = 0; offset < observations.length; offset += 3) {
    await Promise.all(observations.slice(offset, offset + 3).map(async row => {
      const day = new Date(`${row.date}T00:00:00.000Z`);
      const rate = rates.find(rate => fxPeriodIncludes(rate, day));
      const productId = resolve.get(row.campaignId)?.productId || unlinkedProductId!;
      if (!resolve.has(row.campaignId)) unlinked += 1;
      if (!rate) {
        skippedNoFx += 1;
        const key = `${row.date}:${row.account.currency}`;
        const total = missing.get(key) || { date: row.date, currency: row.account.currency, amount: 0, rows: 0 };
        total.amount = Math.round((total.amount + row.amount) * 100) / 100; total.rows += 1; missing.set(key, total);
        return;
      }
      try {
        await persistDailySpend({ productId, campaignId: row.campaignId, campaignName: row.campaignName,
          date: day, amount: row.amount, currency: row.account.currency, fxRate: Number(rate.rate), amountIQD: row.amount * Number(rate.rate) });
        rows += 1;
      } catch (error) { errors.set(row.account.id, `${row.account.name || row.account.accountId}: ${(error as Error).message}`); }
    }));
  }
  return { ok: errors.size === 0 && skippedNoFx === 0, days: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
    rows, skippedNoFx, missingFx: [...missing.values()].sort((a, b) => a.date.localeCompare(b.date)), unlinked,
    accountsOk: accounts.length - errors.size, accountsErr: errors.size, message: [...errors.values()].join(" | ") || undefined };
}

/**
 * مزامنة صرف يوم كامل عبر كل الحسابات. آمنة للتكرار (upsert بالمفتاح الفريد).
 * dateObj: أي تاريخ — يُستخدم جزء اليوم فقط.
 * opts.log: false = لا تُسجّل عميلة في AdSpendSyncLog (لحلقات الاسترجاع المتعددة الأيام).
 */
export async function syncSpendForDate(
  token: string,
  dateObj: Date,
  opts?: {
    log?: boolean;
    /** اختياري: قصر المزامنة على هذه الحسابات (act_XXXX) — فارغ = كل النشطة. */
    accountIds?: string[];
  },
): Promise<SyncResult> {
  const date = toBaghdadDateStr(dateObj);
  const dayStart = new Date(`${date}T00:00:00.000Z`);

  let accounts = await listAdAccounts(token);
  if (opts?.accountIds && opts.accountIds.length > 0) {
    const wanted = new Set(opts.accountIds);
    accounts = accounts.filter((a) => wanted.has(a.id) || wanted.has(a.accountId));
  }
  const resolve = await buildCampaignProductMap();
  const fx = await fxRateForDate(dayStart);

  // الحاضن يُجهَّز فقط إن وُجد صرف غير مرتبط فعلاً (كسول — بلا استعلامات بلا داعٍ).
  let unlinkedHeld = false;
  let unlinkedProductId: string | null = null;

  let accountsOk = 0;
  let accountsErr = 0;
  let rows = 0;
  let unlinked = 0;
  let skippedNoFx = 0;
  const errors: string[] = [];
  const missing = new Map<string, { date: string; currency: string; amount: number; rows: number }>();

  for (const acc of accounts) {
    if (acc.status !== 1) continue; // حساب غير مفعّل
    try {
      const spends = await fetchCampaignSpendForDate(acc.id, token, date);
      accountsOk += 1;
      for (const s of spends) {
        if (!(s.spend > 0)) continue; // لا صفوف للصفر (نظافة بيانات)
        let linked = resolve.get(s.campaignId);
        if (!fx) {
          skippedNoFx += 1;
          if (!linked) unlinked += 1;
          const total = missing.get(acc.currency) || { date, currency: acc.currency, amount: 0, rows: 0 };
          total.amount = Math.round((total.amount + s.spend) * 100) / 100; total.rows += 1;
          missing.set(acc.currency, total);
          continue;
        }
        if (!linked) {
          // الصرف غير المرتبط لا يُرمى — يُخزَّن تحت بند «غير مصنّف» حتى لا
          // ينقص إجمالي الإعلان في صفحة الأرباح. عند الربط لاحقاً، المزامنة
          // التالية (أو الاسترجاع) تنقل الصرف للمنتج الصحيح دون مضاعفة الصف.
          unlinked += 1;
          if (!unlinkedHeld) {
            unlinkedProductId = await getOrCreateUnlinkedProduct();
            unlinkedHeld = true;
          }
          linked = { productId: unlinkedProductId as string, campaignName: s.campaignName };
        }
        const amountIQD = s.spend * fx.rate;
        await persistDailySpend({
            productId: linked.productId,
            campaignId: s.campaignId,
            date: dayStart,
            amount: s.spend,
            currency: acc.currency,
            amountIQD,
            fxRate: fx.rate,
            campaignName: s.campaignName ?? linked.campaignName,
        });
        rows += 1;
      }
    } catch (e) {
      accountsErr += 1;
      errors.push(`${acc.accountId}: ${(e as Error).message}`);
    }
  }

  const ok = accountsErr === 0 && skippedNoFx === 0;
  const missingFx = [...missing.values()];
  const message = errors[0] || (missingFx.length ? `بلا سعر صرف يوم ${date}: ${missingFx.map(item => `${item.amount.toFixed(2)} ${item.currency}`).join("، ")}` : undefined);
  if (opts?.log !== false) {
    await prisma.adSpendSyncLog.create({
      data: {
        date: dayStart,
        ok,
        accountsOk,
        accountsErr,
        rows,
        unlinked,
        message:
          errors.slice(0, 5).join(" | ") || message || null,
      },
    });
  }

  return { ok, date, accountsOk, accountsErr, rows, unlinked, skippedNoFx, missingFx, message };
}

/** yyyy-mm-dd بتوقيت بغداد (UTC+3 بلا توقيت صيفي). */
export function toBaghdadDateStr(d: Date): string {
  const b = new Date(d.getTime() + 3 * 3600 * 1000);
  return b.toISOString().slice(0, 10);
}

/** أمس بتوقيت بغداد كمنتصف يوم UTC. */
export function yesterdayBaghdad(): Date {
  const now = new Date();
  const b = new Date(now.getTime() + 3 * 3600 * 1000);
  b.setUTCDate(b.getUTCDate() - 1);
  return new Date(b.toISOString().slice(0, 10) + "T00:00:00.000Z");
}
