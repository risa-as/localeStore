import { graphGet, graphPost } from "./graph";

/**
 * إطلاق إعلان من منشور موجود على صفحة فيسبوك.
 *
 * التسلسل: حملة ← مجموعة إعلانية ← إعلان مبدع (من منشور الصفحة) ← إعلان.
 * كل شيء يُنشأ بحالة PAUSED — لا يُصرف أي مبلغ حتى يفعّله المستخدم في مدير
 * الإعلانات، حيث يرى الميزانية الحقيقية بعملته. هذه هي شبكة الأمان الأساسية.
 *
 * ملاحظة الأصول: نعزّز منشور الصفحة (object_story_id). مواضع الإعلان يمكن أن
 * تشمل إنستغرام تلقائياً، فلا حاجة لمسار مبدع منفصل لإنستغرام هنا.
 */

// أهداف ODAX المدعومة في الواجهة، وما يناسبها من هدف تحسين وحدث فوترة.
export const AD_OBJECTIVES = {
  OUTCOME_TRAFFIC: {
    label: "زيارات (نقرات للرابط)",
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
  },
  OUTCOME_ENGAGEMENT: {
    label: "تفاعل مع المنشور",
    optimization_goal: "POST_ENGAGEMENT",
    billing_event: "IMPRESSIONS",
  },
  OUTCOME_AWARENESS: {
    label: "وصول (وعي بالعلامة)",
    optimization_goal: "REACH",
    billing_event: "IMPRESSIONS",
  },
} as const;

export type AdObjective = keyof typeof AD_OBJECTIVES;

/**
 * عدد الوحدات الصغرى لكل وحدة عملة كاملة (currency offset).
 * الدنانير الخليجية ثلاثية الكسور (IQD وأخواتها) تستخدم 1000 في Meta،
 * العملات عديمة الكسور تستخدم 1، والباقي 100. نتحقق أيضاً من الحساب وقت الإطلاق.
 */
const OFFSET_1000 = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
const OFFSET_1 = [
  "CLP",
  "JPY",
  "KRW",
  "VND",
  "HUF",
  "TWD",
  "ISK",
  "UGX",
  "PYG",
];

export function currencyOffset(code: string): number {
  const c = (code || "").toUpperCase();
  if (OFFSET_1000.includes(c)) return 1000;
  if (OFFSET_1.includes(c)) return 1;
  return 100;
}

/** يجلب عملة الحساب الإعلاني (لعرض/تحويل الميزانية بدقّة). */
export async function getAdAccountCurrency(
  adAccountId: string,
  token: string,
): Promise<string> {
  // adAccountId يأتي بصيغة act_XXXX من /me/adaccounts
  const res = await graphGet<{ currency?: string }>(adAccountId, token, {
    fields: "currency",
  });
  return res.currency ?? "IQD";
}

export type LaunchResult = {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  currency: string;
  minorBudget: number;
};

export async function launchAdFromPagePost(params: {
  adAccountId: string; // act_XXXX
  token: string; // توكن المستخدم (له صلاحية على الحساب الإعلاني)
  pageId: string;
  postId: string; // معرّف منشور الصفحة الكامل {pageId}_{postId}
  objective: AdObjective;
  dailyBudgetWhole: number; // بوحدة العملة الكاملة (مثلاً 5000 د.ع)
  startTime?: Date;
  endTime?: Date;
  campaignName: string;
}): Promise<LaunchResult> {
  const {
    adAccountId,
    token,
    pageId,
    postId,
    objective,
    dailyBudgetWhole,
    startTime,
    endTime,
    campaignName,
  } = params;

  const spec = AD_OBJECTIVES[objective];
  const currency = await getAdAccountCurrency(adAccountId, token);
  const minorBudget = Math.round(dailyBudgetWhole * currencyOffset(currency));

  // 1) حملة — PAUSED، بلا فئات إعلانية خاصة.
  const campaign = await graphPost<{ id: string }>(
    `${adAccountId}/campaigns`,
    token,
    {
      name: campaignName,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
    },
  );

  // 2) مجموعة إعلانية — الميزانية اليومية، الاستهداف (العراق)، PAUSED.
  const adSet = await graphPost<{ id: string }>(
    `${adAccountId}/adsets`,
    token,
    {
      name: `${campaignName} — مجموعة`,
      campaign_id: campaign.id,
      daily_budget: minorBudget,
      billing_event: spec.billing_event,
      optimization_goal: spec.optimization_goal,
      targeting: { geo_locations: { countries: ["IQ"] } },
      status: "PAUSED",
      ...(startTime ? { start_time: startTime.toISOString() } : {}),
      ...(endTime ? { end_time: endTime.toISOString() } : {}),
    },
  );

  // 3) إعلان مبدع من منشور الصفحة الموجود.
  const creative = await graphPost<{ id: string }>(
    `${adAccountId}/adcreatives`,
    token,
    {
      name: `${campaignName} — مبدع`,
      object_story_id: postId.includes("_") ? postId : `${pageId}_${postId}`,
    },
  );

  // 4) الإعلان — PAUSED.
  const ad = await graphPost<{ id: string }>(`${adAccountId}/ads`, token, {
    name: `${campaignName} — إعلان`,
    adset_id: adSet.id,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  return {
    campaignId: campaign.id,
    adSetId: adSet.id,
    creativeId: creative.id,
    adId: ad.id,
    currency,
    minorBudget,
  };
}
