import { graphGet, graphPost } from "./graph";
import { currencyOffset } from "./ads";

/**
 * تقارير أداء الإعلانات عبر كل الحسابات الإعلانية.
 *
 * مقياس النتيجة يعتمد على الهدف:
 *   - مبيعات → عملية شراء (omni_purchase): العدد وكلفة الشراء.
 *   - تفاعل/رسائل → محادثة مبدوءة (onsite_conversion.messaging_conversation_started_7d).
 * نُرجع المقياسين معاً (كلٌّ null إن غاب) فيعرض كل إعلان ما يخصّه دون تخمين الهدف.
 *
 * ملاحظة: cost_per_action_type يحذف النوع كلياً حين العدد صفر — لذا نُميّز بين
 * «صفر» (لا نتيجة) و«null» (لا كلفة مُحتسَبة) ونعرض «—» للأخيرة.
 */

const PURCHASE = "omni_purchase";
const MESSAGE = "onsite_conversion.messaging_conversation_started_7d";

export type InsightMetric = { count: number; cost: number | null };

export type InsightsPeriod = {
  datePreset?: string; // مثل last_30d, this_month, maximum
  since?: string; // YYYY-MM-DD (مع until = نطاق مخصّص)
  until?: string;
};

export type AdInsightRow = {
  id: string;
  name: string;
  status: string; // effective_status
  objective: string | null;
  spend: number;
  impressions: number;
  // المبلغ المخصّص للترويج (ميزانية المجموعة أو الحملة عند تحسين ميزانية الحملة).
  budget: { amount: number; period: "daily" | "lifetime" } | null;
  purchase: InsightMetric;
  message: InsightMetric;
  // لربط الإعلان بمجموعته عند إعادة التجميع تحت الحملة.
  adsetId: string | null;
};

/** مجموعة إعلانية داخل بطاقة الحملة. */
export type AdSetRow = {
  id: string;
  name: string;
  status: string; // مشتق من إعلاناتها
  budget: { amount: number; period: "daily" | "lifetime" } | null;
  ads: AdInsightRow[];
};

/** بطاقة الحملة — الوحدة التي يديرها المالك في مدير إعلانات Meta. */
export type CampaignRow = {
  id: string;
  name: string;
  status: string; // effective_status كما تعيده Meta
  objective: string | null;
  spend: number;
  impressions: number;
  budget: { amount: number; period: "daily" | "lifetime" } | null;
  purchase: InsightMetric;
  message: InsightMetric;
  adSets: AdSetRow[];
  ads: AdInsightRow[];
  activeCount: number;
  /** المنتج المرتبط (ربط يدوي أو إطلاق نظام) — اختياري للعرض في الأداء. */
  productName?: string | null;
  /** true = ربط تلقائي من إطلاقات النظام. */
  productAuto?: boolean;
};

export type AccountInsight = {
  id: string; // act_XXXX
  accountId: string;
  name: string;
  currency: string;
  status: number; // account_status
  spend: number;
  impressions: number;
  reach: number;
  purchase: InsightMetric;
  message: InsightMetric;
  ads: AdInsightRow[];
  campaigns: CampaignRow[];
  activeCount: number;
  error: string | null;
};


/** قوائم تحكّم الفترة الزمنية (تُعرض في الواجهة). */
export const DATE_PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "last_7d", label: "آخر 7 أيام" },
  { key: "last_30d", label: "آخر 30 يوماً" },
  { key: "this_month", label: "هذا الشهر" },
  { key: "last_month", label: "الشهر الماضي" },
  { key: "maximum", label: "منذ البداية" },
];

export type AdInsightsResult = {
  ok: boolean;
  message?: string;
  activeOnly: boolean;
  accounts: AccountInsight[];
  totals: {
    spend: number;
    purchases: number;
    messages: number;
    currency: string | null; // null إن اختلفت عملات الحسابات
    accountsShown: number;
    accountsTotal: number;
  };
  generatedAt: string;
};

type Raw = {
  spend?: string;
  account_currency?: string;
  impressions?: string;
  reach?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  // معرّف الحملة في insights level=campaign — قد يأتي بهذا الشكل بدل campaign_id.
  campaign?: { id?: string };
};

function metric(row: Raw | undefined, type: string): InsightMetric {
  const count = Number(row?.actions?.find((a) => a.action_type === type)?.value ?? 0);
  const costRaw = row?.cost_per_action_type?.find((a) => a.action_type === type)?.value;
  return { count, cost: costRaw != null ? Number(costRaw) : null };
}

/** معاملات الوقت لنقطة /insights (استعلام) وللتوسعة المتداخلة على /ads. */
function timeQuery(p: InsightsPeriod): Record<string, string | undefined> {
  if (p.since && p.until)
    return { time_range: JSON.stringify({ since: p.since, until: p.until }) };
  return { date_preset: p.datePreset || "last_30d" };
}
function timeExpansion(p: InsightsPeriod): string {
  if (p.since && p.until)
    return `time_range({"since":"${p.since}","until":"${p.until}"})`;
  return `date_preset(${p.datePreset || "last_30d"})`;
}

/** كل الحسابات الإعلانية على التوكن (حيّة، مع العملة والحالة). */
export async function getAllAdAccounts(
  token: string,
): Promise<{ id: string; accountId: string; name: string; currency: string; status: number }[]> {
  const j = await graphGet<{
    data?: { id: string; account_id: string; name: string; currency: string; account_status: number }[];
  }>("me/adaccounts", token, {
    fields: "name,account_id,currency,account_status",
    limit: "200",
  });
  return (j.data ?? []).map((a) => ({
    id: a.id,
    accountId: a.account_id,
    name: a.name,
    currency: a.currency,
    status: a.account_status,
  }));
}

/** ملخّص الحساب للفترة (إجمالي — كل الإعلانات، بلا بُعد حالة). */
async function getAccountSummary(actId: string, token: string, period: InsightsPeriod) {
  const j = await graphGet<{ data?: Raw[] }>(`${actId}/insights`, token, {
    fields: "spend,account_currency,actions,cost_per_action_type,impressions,reach",
    level: "account",
    ...timeQuery(period),
  });
  const r = j.data?.[0];
  return {
    spend: Number(r?.spend ?? 0),
    currency: r?.account_currency ?? null,
    impressions: Number(r?.impressions ?? 0),
    reach: Number(r?.reach ?? 0),
    purchase: metric(r, PURCHASE),
    message: metric(r, MESSAGE),
  };
}

/** إعلانات الحساب للفترة (مع النتائج)؛ activeOnly يقصرها على النشطة فعلاً. */
/** المبلغ المخصّص للترويج: ميزانية المجموعة، وإلا الحملة (CBO)؛ اليومية قبل الإجمالية. */
function pickBudget(
  ad: {
    adset?: { daily_budget?: string; lifetime_budget?: string };
    campaign?: { daily_budget?: string; lifetime_budget?: string };
  },
  offset: number,
): { amount: number; period: "daily" | "lifetime" } | null {
  const v = (x?: string) => {
    const n = Number(x);
    return n > 0 ? n : 0;
  };
  const daily = v(ad.adset?.daily_budget) || v(ad.campaign?.daily_budget);
  if (daily) return { amount: daily / offset, period: "daily" };
  const lifetime =
    v(ad.adset?.lifetime_budget) || v(ad.campaign?.lifetime_budget);
  if (lifetime) return { amount: lifetime / offset, period: "lifetime" };
  return null;
}

async function getAccountAds(
  actId: string,
  token: string,
  currency: string,
  period: InsightsPeriod,
  activeOnly: boolean,
): Promise<AdInsightRow[]> {
  const params: Record<string, string | undefined> = {
    fields: `adset_id,name,effective_status,adset{daily_budget,lifetime_budget},campaign{objective,daily_budget,lifetime_budget},insights.${timeExpansion(period)}{spend,actions,cost_per_action_type,impressions,reach}`,
    limit: "50",
  };
  if (activeOnly)
    params.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
    ]);
  const j = await graphGet<{
    data?: {
      id: string;
      adset_id?: string;
      name?: string;
      effective_status?: string;
      adset?: { daily_budget?: string; lifetime_budget?: string };
      campaign?: {
        objective?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      };
      insights?: { data?: Raw[] };
    }[];
  }>(`${actId}/ads`, token, params);
  const offset = currencyOffset(currency);
  const ads = (j.data ?? []).map((ad) => {
    const r = ad.insights?.data?.[0];
    return {
      id: ad.id,
      adsetId: ad.adset_id ?? null,
      name: ad.name ?? "إعلان",
      status: ad.effective_status ?? "UNKNOWN",
      objective: ad.campaign?.objective ?? null,
      spend: Number(r?.spend ?? 0),
      impressions: Number(r?.impressions ?? 0),
      budget: pickBudget(ad, offset),
      purchase: metric(r, PURCHASE),
      message: metric(r, MESSAGE),
    };
  });
  ads.sort((a, b) => b.spend - a.spend);
  return ads;
}

/** ملخصات كل حملات الحساب — مبنيّة من إعلاناتها (المصدر الموثوق للمطابقة). */
async function getCampaignSummaries(
  actId: string,
  token: string,
  currency: string,
  period: InsightsPeriod,
  activeOnly: boolean,
): Promise<
  Map<
    string,
    {
      spend: number;
      impressions: number;
      purchase: InsightMetric;
      message: InsightMetric;
    }
  >
> {
  // ملاحظة تشخيصية (تم التحقق مباشرة من Graph): نداء insights level=campaign
  // على هذا الحساب لا يُرجع campaign_id في صفوفه — ففشلت المطابقة وبقي صرف
  // الحملات صفراً. الحل: نجمع insights مستوى الإعلان (من /ads حيث campaign
  // ظاهر) ونجمّعها يدوياً تحت حملاتها عبر خريطة المجموعات → الحملة.
  const [ads, adsetsRes] = await Promise.all([
    getAccountAds(actId, token, currency, period, activeOnly),
    graphGet<{ data?: { id: string; campaign_id?: string }[] }>(
      `${actId}/adsets`,
      token,
      { fields: "campaign_id", limit: "250" },
    ),
  ]);
  const adsetToCampaign = new Map<string, string>();
  for (const s of adsetsRes.data ?? []) {
    if (s.campaign_id) adsetToCampaign.set(s.id, s.campaign_id);
  }
  const map = new Map<
    string,
    {
      spend: number;
      impressions: number;
      purchase: InsightMetric;
      message: InsightMetric;
    }
  >();
  for (const ad of ads) {
    const cid = ad.adsetId ? adsetToCampaign.get(ad.adsetId) : null;
    if (!cid) continue;
    const cur =
      map.get(cid) ??
      {
        spend: 0,
        impressions: 0,
        purchase: { count: 0, cost: null },
        message: { count: 0, cost: null },
      };
    cur.spend += ad.spend;
    cur.impressions += ad.impressions;
    if (ad.purchase.count > 0 || ad.purchase.cost != null) {
      cur.purchase.count += ad.purchase.count;
      if (ad.purchase.cost != null) cur.purchase.cost = ad.purchase.cost;
    }
    if (ad.message.count > 0 || ad.message.cost != null) {
      cur.message.count += ad.message.count;
      if (ad.message.cost != null) cur.message.cost = ad.message.cost;
    }
    map.set(cid, cur);
  }
  return map;
}
/** حملات الحساب مع مجموعاتها الإعلانية وإعلاناتها — الوحدة التي يديرها المالك. */
export async function getAccountCampaigns(
  actId: string,
  token: string,
  currency: string,
  period: InsightsPeriod,
  activeOnly: boolean,
): Promise<CampaignRow[]> {
  const offset = currencyOffset(currency);
  const campParams: Record<string, string | undefined> = {
    fields: "name,effective_status,objective,daily_budget,lifetime_budget",
    limit: "100",
  };
  if (activeOnly)
    campParams.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
    ]);
  const [campsRes, adsetsRes, ads, sums] = await Promise.all([
    graphGet<{
      data?: {
        id: string;
        name?: string;
        effective_status?: string;
        objective?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      }[];
    }>(`${actId}/campaigns`, token, campParams),
    graphGet<{
      data?: {
        id: string;
        campaign_id?: string;
        name?: string;
        effective_status?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      }[];
    }>(`${actId}/adsets`, token, {
      fields: "campaign_id,name,effective_status,daily_budget,lifetime_budget",
      limit: "250",
      ...(activeOnly
        ? {
            filtering: JSON.stringify([
              { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
            ]),
          }
        : {}),
    }),
    getAccountAds(actId, token, currency, period, activeOnly),
    getCampaignSummaries(actId, token, currency, period, activeOnly),
  ]);

  const camps = (campsRes.data ?? []).filter(
    (c) => c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED",
  );

  const rows: CampaignRow[] = camps.map((c) => {
    const sum = sums.get(c.id);
    return {
      id: c.id,
      name: c.name ?? "حملة",
      status: c.effective_status ?? "UNKNOWN",
      objective: c.objective ?? null,
      spend: sum?.spend ?? 0,
      impressions: sum?.impressions ?? 0,
      budget: pickBudget({ campaign: c }, offset),
      purchase: sum?.purchase ?? { count: 0, cost: null },
      message: sum?.message ?? { count: 0, cost: null },
      adSets: [],
      ads: [],
      activeCount: 0,
    };
  });

  // تجميع المجموعات الإعلانية تحت حملاتها ثم توزيع الإعلانات عليها.
  const setsByCampaign = new Map<string, AdSetRow[]>();
  for (const a of adsetsRes.data ?? []) {
    if (!a.campaign_id) continue;
    const list = setsByCampaign.get(a.campaign_id) ?? [];
    list.push({
      id: a.id,
      name: a.name ?? "مجموعة",
      status: a.effective_status ?? "UNKNOWN",
      budget: pickBudget({ adset: a }, offset),
      ads: [],
    });
    setsByCampaign.set(a.campaign_id, list);
  }

  // الإعلانات التي لم تجد مجموعتها (مجموعة مفلترة في activeOnly، أو adsetId غائب
  // في الإعلانات المُنشأة بـ GUIDED_CREATION) — نربطها بحملتها عبر adsetId →
  // مجموعة → حملة، وإلا تبقى معلّقة ويظهر صرفها صفراً خطأً في بطاقة الحملة.
  const adsetToCampaign = new Map<string, string>();
  for (const [cid, sets] of setsByCampaign)
    for (const s of sets) adsetToCampaign.set(s.id, cid);

  for (const camp of rows) {
    const sets = setsByCampaign.get(camp.id) ?? [];
    for (const ad of ads) {
      const target = ad.adsetId ? sets.find((s) => s.id === ad.adsetId) : null;
      if (target) {
        target.ads.push(ad);
        continue;
      }
      // fallback 1: المجموعة غير موجودة في قوائمنا (مفلترة) — أنشئ مجموعة حامل
      // تحت الحملة الصحيحة كي لا يضيع إعلانها وصرفه.
      if (ad.adsetId) {
        const cid = adsetToCampaign.get(ad.adsetId);
        if (cid === camp.id) {
          let holder = sets.find((s) => s.id === ad.adsetId);
          if (!holder) {
            holder = {
              id: ad.adsetId,
              name: "مجموعة الإعلان",
              status: ad.status,
              budget: null,
              ads: [],
            };
            sets.push(holder);
            adsetToCampaign.set(ad.adsetId, camp.id);
          }
          holder.ads.push(ad);
        }
      }
    }
    for (const s of sets) {
      s.ads.sort((a, b) => b.spend - a.spend);
      s.status = deriveGroupStatus(s.ads);
    }
    sets.sort(
      (a, b) =>
        b.ads.length - a.ads.length ||
        b.ads.reduce((s, x) => s + x.spend, 0) -
          a.ads.reduce((s, x) => s + x.spend, 0),
    );
    camp.adSets = sets;
    camp.ads = sets.flatMap((s) => s.ads);
    camp.activeCount = camp.ads.filter((a) => a.status === "ACTIVE").length;
  }
  rows.sort((a, b) => b.spend - a.spend || b.ads.length - a.ads.length);
  return rows;
}

/** حالة المجموعة الإعلانية مشتقة من إعلاناتها. */
function deriveGroupStatus(ads: { status: string }[]): string {
  if (ads.length === 0) return "ADSET_NO_ACTIVE_ADS";
  if (ads.some((a) => a.status === "ACTIVE")) return "ACTIVE";
  if (
    ads.some((a) =>
      ["WITH_ISSUES", "PENDING_REVIEW", "IN_PROCESS"].includes(a.status),
    )
  )
    return "ADSET_ATTENTION";
  if (ads.some((a) => a.status === "DISAPPROVED")) return "ADSET_REJECTED";
  return "PAUSED";
}

/**
 * تشغيل/إطفاء إعلان.
 * - التشغيل يفعّل الحملة ثم المجموعة ثم الإعلان (وإلا يبقى الإعلان موقوفاً بسبب
 *   أحد أبويه فلا يعرض) — إعلانات النظام تُنشأ والحملة موقوفة.
 * - الإطفاء يوقف الإعلان فقط (لا نمسّ الحملة/المجموعة حتى لا نؤثّر على إعلانات
 *   أخرى فيها).
 * يعيد effective_status الناتج بعد التغيير.
 */
export async function setAdRunning(
  adId: string,
  token: string,
  active: boolean,
): Promise<string> {
  if (active) {
    const info = await graphGet<{
      campaign?: { id: string };
      adset?: { id: string };
    }>(adId, token, { fields: "campaign{id},adset{id}" });
    if (info.campaign?.id)
      await graphPost(info.campaign.id, token, { status: "ACTIVE" });
    if (info.adset?.id)
      await graphPost(info.adset.id, token, { status: "ACTIVE" });
    await graphPost(adId, token, { status: "ACTIVE" });
  } else {
    await graphPost(adId, token, { status: "PAUSED" });
  }
  const r = await graphGet<{ effective_status?: string }>(adId, token, {
    fields: "effective_status",
  });
  return r.effective_status ?? (active ? "ACTIVE" : "PAUSED");
}

/**
 * تشغيل/إطفاء حملة إعلانية كاملة.
 * - الإطفاء: يوقف الحملة فقط — فيتوقف عرض كل إعلاناتها دفعة واحدة (وهو ما يراه
 *   المالك في مدير الإعلانات).
 * - التشغيل: يفعّل الحملة ثم مجموعاتها ثم إعلاناتها (إعلانات النظام تُنشأ
 *   والسلسلة كلها موقوفة)، مع تخطي المرفوض وقيد المراجعة والمشاكل.
 */
export async function setCampaignRunning(
  campaignId: string,
  token: string,
  active: boolean,
): Promise<string> {
  if (!active) {
    await graphPost(campaignId, token, { status: "PAUSED" });
    return "CAMPAIGN_PAUSED";
  }
  await graphPost(campaignId, token, { status: "ACTIVE" });
  const SKIP = ["ACTIVE", "DISAPPROVED", "PENDING_REVIEW", "WITH_ISSUES"];
  const sets = await graphGet<{
    data?: { id: string; effective_status?: string }[];
  }>(`${campaignId}/adsets`, token, { fields: "effective_status", limit: "100" });
  const setIds = (sets.data ?? [])
    .filter((s) => !SKIP.includes(s.effective_status ?? ""))
    .map((s) => s.id);
  await Promise.allSettled(
    setIds.map((id) => graphPost(id, token, { status: "ACTIVE" })),
  );
  const ads = await graphGet<{
    data?: { id: string; effective_status?: string }[];
  }>(`${campaignId}/ads`, token, { fields: "effective_status", limit: "250" });
  const adIds = (ads.data ?? [])
    .filter((a) => !SKIP.includes(a.effective_status ?? ""))
    .map((a) => a.id);
  await Promise.allSettled(
    adIds.map((id) => graphPost(id, token, { status: "ACTIVE" })),
  );
  const r = await graphGet<{ effective_status?: string }>(campaignId, token, {
    fields: "effective_status",
  });
  return r.effective_status ?? "ACTIVE";
}

/** ملخّص + إعلانات حساب واحد، مع try/catch محلّي (فشل حساب لا يُسقط البقية). */
export async function getAccountInsight(
  acc: { id: string; accountId: string; name: string; currency: string; status: number },
  token: string,
  period: InsightsPeriod,
  activeOnly: boolean,
): Promise<AccountInsight> {
  try {
    const [sum, campaigns] = await Promise.all([
      getAccountSummary(acc.id, token, period),
      getAccountCampaigns(
        acc.id,
        token,
        acc.currency,
        period,
        activeOnly,
      ),
    ]);
    const ads = campaigns.flatMap((c) => c.ads);
    return {
      ...acc,
      currency: sum.currency ?? acc.currency,
      spend: sum.spend,
      impressions: sum.impressions,
      reach: sum.reach,
      purchase: sum.purchase,
      message: sum.message,
      ads,
      campaigns,
      activeCount: ads.filter((a) => a.status === "ACTIVE").length,
      error: null,
    };
  } catch (e) {
    return {
      ...acc,
      spend: 0,
      impressions: 0,
      reach: 0,
      purchase: { count: 0, cost: null },
      message: { count: 0, cost: null },
      ads: [],
      campaigns: [],
      activeCount: 0,
      error: (e as Error).message,
    };
  }
}
