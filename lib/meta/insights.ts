import { graphGet, graphPost } from "./graph";

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
  purchase: InsightMetric;
  message: InsightMetric;
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
async function getAccountAds(
  actId: string,
  token: string,
  period: InsightsPeriod,
  activeOnly: boolean,
): Promise<AdInsightRow[]> {
  const params: Record<string, string | undefined> = {
    fields: `name,effective_status,campaign{objective},insights.${timeExpansion(period)}{spend,actions,cost_per_action_type,impressions,reach}`,
    limit: "50",
  };
  if (activeOnly)
    params.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
    ]);
  const j = await graphGet<{
    data?: {
      id: string;
      name?: string;
      effective_status?: string;
      campaign?: { objective?: string };
      insights?: { data?: Raw[] };
    }[];
  }>(`${actId}/ads`, token, params);
  const ads = (j.data ?? []).map((ad) => {
    const r = ad.insights?.data?.[0];
    return {
      id: ad.id,
      name: ad.name ?? "إعلان",
      status: ad.effective_status ?? "UNKNOWN",
      objective: ad.campaign?.objective ?? null,
      spend: Number(r?.spend ?? 0),
      impressions: Number(r?.impressions ?? 0),
      purchase: metric(r, PURCHASE),
      message: metric(r, MESSAGE),
    };
  });
  ads.sort((a, b) => b.spend - a.spend);
  return ads;
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

/** ملخّص + إعلانات حساب واحد، مع try/catch محلّي (فشل حساب لا يُسقط البقية). */
export async function getAccountInsight(
  acc: { id: string; accountId: string; name: string; currency: string; status: number },
  token: string,
  period: InsightsPeriod,
  activeOnly: boolean,
): Promise<AccountInsight> {
  try {
    const [sum, ads] = await Promise.all([
      getAccountSummary(acc.id, token, period),
      getAccountAds(acc.id, token, period, activeOnly),
    ]);
    return {
      ...acc,
      currency: sum.currency ?? acc.currency,
      spend: sum.spend,
      impressions: sum.impressions,
      reach: sum.reach,
      purchase: sum.purchase,
      message: sum.message,
      ads,
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
      activeCount: 0,
      error: (e as Error).message,
    };
  }
}
