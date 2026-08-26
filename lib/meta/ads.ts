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
 * زر الحث على الإجراء (CTA). النص ثابت من Meta ويُعرض مترجَماً تلقائياً —
 * لا يمكن كتابة نص حر. BOOK_NOW يُعرض «حجز الآن» ويطابق زر صفحة الهبوط.
 * (BOOK_TRAVEL مختلف — خاص بالسفر — لذا لا نستخدمه.)
 */
export const AD_CTAS = {
  BOOK_NOW: "حجز الآن",
} as const;

export type AdCta = keyof typeof AD_CTAS;

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

/** صورة مصغّرة للفيديو (مطلوبة كخيار في مبدع الفيديو). تفشل بهدوء إن تعذّرت. */
export async function getVideoThumbnail(
  videoId: string,
  token: string,
): Promise<string | undefined> {
  try {
    const res = await graphGet<{
      thumbnails?: { data: { uri: string; is_preferred?: boolean }[] };
    }>(videoId, token, { fields: "thumbnails" });
    const thumbs = res.thumbnails?.data ?? [];
    const preferred = thumbs.find((t) => t.is_preferred) ?? thumbs[0];
    return preferred?.uri;
  } catch {
    return undefined;
  }
}

export type VideoAdTargeting = {
  ageMin: number;
  ageMax: number;
  gender?: "all" | "male" | "female";
  /** فارغة/غير محددة = مواضع تلقائية (فيسبوك + إنستغرام). */
  placements?: ("facebook" | "instagram")[];
};

/**
 * إعلان فيديو مبيعات: يوجّه لزر (CTA) إلى صفحة هبوط المنتج.
 * الهدف OUTCOME_TRAFFIC مع تحسين نقرات الرابط — الأنسب لسَوق الزائر إلى الهبوط.
 * كل شيء PAUSED؛ يفعّله المستخدم في مدير الإعلانات بعد المراجعة.
 */
export async function launchVideoAd(params: {
  adAccountId: string;
  token: string;
  pageId: string;
  videoId: string;
  message: string;
  destinationUrl: string;
  cta: AdCta;
  dailyBudgetWhole: number;
  targeting: VideoAdTargeting;
  campaignName: string;
}): Promise<LaunchResult> {
  const {
    adAccountId,
    token,
    pageId,
    videoId,
    message,
    destinationUrl,
    cta,
    dailyBudgetWhole,
    targeting,
    campaignName,
  } = params;

  const currency = await getAdAccountCurrency(adAccountId, token);
  const minorBudget = Math.round(dailyBudgetWhole * currencyOffset(currency));
  const thumbnail = await getVideoThumbnail(videoId, token);

  // 1) حملة — زيارات (سوق للهبوط)، PAUSED.
  const campaign = await graphPost<{ id: string }>(
    `${adAccountId}/campaigns`,
    token,
    {
      name: campaignName,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
    },
  );

  // 2) مجموعة إعلانية — الاستهداف + الميزانية، PAUSED.
  const t: Record<string, unknown> = {
    geo_locations: { countries: ["IQ"] },
    age_min: targeting.ageMin,
    age_max: targeting.ageMax,
  };
  if (targeting.gender === "male") t.genders = [1];
  else if (targeting.gender === "female") t.genders = [2];
  // مواضع محددة فقط عند طلبها؛ الافتراضي تلقائي (نتركها بلا publisher_platforms).
  if (targeting.placements && targeting.placements.length > 0)
    t.publisher_platforms = targeting.placements;

  const adSet = await graphPost<{ id: string }>(
    `${adAccountId}/adsets`,
    token,
    {
      name: `${campaignName} — مجموعة`,
      campaign_id: campaign.id,
      daily_budget: minorBudget,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      targeting: t,
      status: "PAUSED",
    },
  );

  // 3) مبدع فيديو بزر يوجّه لصفحة الهبوط.
  const videoData: Record<string, unknown> = {
    video_id: videoId,
    message,
    call_to_action: { type: cta, value: { link: destinationUrl } },
    link_description: destinationUrl,
  };
  if (thumbnail) videoData.image_url = thumbnail;

  const creative = await graphPost<{ id: string }>(
    `${adAccountId}/adcreatives`,
    token,
    {
      name: `${campaignName} — مبدع`,
      object_story_spec: { page_id: pageId, video_data: videoData },
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
