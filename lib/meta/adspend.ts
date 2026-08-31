import { graphGet } from "./graph";
import { prisma } from "@/db/prisma";

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
 * إعادة تصنيف صفوفه ببساطة عند الربط اليدوي (upsert بنفس المفتاح يستبدله).
 */
export const UNLINKED_PRODUCT_NAME = "غير مصنّف (حملات بلا ربط)";

async function getOrCreateUnlinkedProduct(): Promise<string> {
  const existing = await prisma.product.findFirst({
    where: { name: UNLINKED_PRODUCT_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.product.create({
    data: {
      name: UNLINKED_PRODUCT_NAME,
      slug: "unlinked-ad-spend",
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
  const j = await graphGet<{
    data?: { id: string; account_id: string; name?: string; currency: string; account_status: number }[];
  }>("me/adaccounts", token, {
    fields: "name,account_id,currency,account_status",
    limit: "200",
  });
  return (j.data ?? []).map((a) => ({
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
  const j = await graphGet<{
    data?: { spend?: string; campaign_id?: string; campaign_name?: string }[];
  }>(`${actId}/insights`, token, {
    fields: "spend,campaign_id,campaign_name",
    level: "campaign",
    time_range: JSON.stringify({ since: date, until: date }),
    limit: "100",
  });
  return (j.data ?? [])
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
  const j = await graphGet<{
    data?: { spend?: string; campaign_id?: string; campaign_name?: string }[];
  }>(`${actId}/insights`, token, {
    fields: "spend,campaign_id,campaign_name",
    level: "campaign",
    time_range: JSON.stringify({ since: from, until: to }),
    limit: "100",
  });
  return (j.data ?? [])
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
    where: { fromDate: { lte: day }, OR: [{ toDate: null }, { toDate: { gt: day } }] },
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
  message?: string;
};

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

  for (const acc of accounts) {
    if (acc.status !== 1) continue; // حساب غير مفعّل
    try {
      const spends = await fetchCampaignSpendForDate(acc.id, token, date);
      accountsOk += 1;
      for (const s of spends) {
        if (!(s.spend > 0)) continue; // لا صفوف للصفر (نظافة بيانات)
        let linked = resolve.get(s.campaignId);
        if (!linked) {
          // الصرف غير المرتبط لا يُرمى — يُخزَّن تحت بند «غير مصنّف» حتى لا
          // ينقص إجمالي الإعلان في صفحة الأرباح. عند الربط لاحقاً، المزامنة
          // التالية (أو الاسترجاع) تنقل الصرف للمنتج الصحيح بنفس المفتاح.
          unlinked += 1;
          if (!fx) {
            skippedNoFx += 1;
            continue;
          }
          if (!unlinkedHeld) {
            unlinkedProductId = await getOrCreateUnlinkedProduct();
            unlinkedHeld = true;
          }
          linked = { productId: unlinkedProductId as string, campaignName: s.campaignName };
        } else if (!fx) {
          skippedNoFx += 1;
          continue;
        }
        const amountIQD = s.spend * fx.rate;
        await prisma.adSpendDaily.upsert({
          where: {
            productId_campaignId_date: {
              productId: linked.productId,
              campaignId: s.campaignId,
              date: dayStart,
            },
          },
          create: {
            productId: linked.productId,
            campaignId: s.campaignId,
            date: dayStart,
            amount: s.spend,
            currency: acc.currency,
            amountIQD,
            fxRate: fx.rate,
            campaignName: s.campaignName ?? linked.campaignName,
          },
          update: {
            amount: s.spend,
            currency: acc.currency,
            amountIQD,
            fxRate: fx.rate,
            campaignName: s.campaignName ?? linked.campaignName,
          },
        });
        rows += 1;
      }
    } catch (e) {
      accountsErr += 1;
      errors.push(`${acc.accountId}: ${(e as Error).message}`);
    }
  }

  const ok = accountsErr === 0;
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
          errors.slice(0, 5).join(" | ") || (skippedNoFx ? "صفوف بلا سعر صرف" : null),
      },
    });
  }

  return { ok, date, accountsOk, accountsErr, rows, unlinked, skippedNoFx, message: errors[0] };
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
