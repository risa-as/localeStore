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
 * لا يمكن كتابة نص حر. كل هذه القيم مقبولة (اختُبرت) مع رابط الهبوط.
 */
export const AD_CTAS = {
  BOOK_NOW: "حجز الآن",
  ORDER_NOW: "اطلب الآن",
  SHOP_NOW: "تسوّق الآن",
  LEARN_MORE: "اعرف المزيد",
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

/** كل بكسلات الحساب الإعلاني (لاختيار البكسل عند هدف «مبيعات»). */
export async function getAdAccountPixels(
  adAccountId: string,
  token: string,
): Promise<{ id: string; name: string }[]> {
  try {
    const res = await graphGet<{ data: { id: string; name: string }[] }>(
      `${adAccountId}/adspixels`,
      token,
      { fields: "id,name", limit: "50" },
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

export type CampaignObjective = "OUTCOME_SALES" | "OUTCOME_ENGAGEMENT";

/** أهداف حملة إعلان الفيديو المتاحة للأدمن. */
export const VIDEO_AD_OBJECTIVES = {
  OUTCOME_SALES: {
    label: "مبيعات (تحويلات)",
    optimization_goal: "OFFSITE_CONVERSIONS",
    needsPixel: true,
  },
  OUTCOME_ENGAGEMENT: {
    label: "تفاعل",
    optimization_goal: "POST_ENGAGEMENT",
    needsPixel: false,
  },
} as const;

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
      // مطلوب عند استخدام ميزانية على مستوى المجموعة (لا ميزانية حملة): false
      // يعني أن كل مجموعة تستخدم ميزانيتها الخاصة بلا مشاركة.
      is_adset_budget_sharing_enabled: false,
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
      // أقل تكلفة تلقائي — لا يتطلب مبلغ عرض أسعار (bid_amount).
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: {
        geo_locations: { countries: ["IQ"] },
        targeting_automation: { advantage_audience: 0 },
      },
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

/** معرّف منشور الصفحة المقابل لفيديو (لاستخدام المنشور الحالي كإعلان). */
export async function getVideoPostId(
  videoId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await graphGet<{ post_id?: string }>(videoId, token, {
      fields: "post_id",
    });
    return res.post_id ?? null;
  } catch {
    return null;
  }
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

export type AdPlacement =
  | "facebook"
  | "instagram"
  | "audience_network"
  | "messenger";

export type VideoAdTargeting = {
  ageMin: number;
  ageMax: number;
  gender?: "all" | "male" | "female";
  /** فارغة/غير محددة = مواضع تلقائية (Advantage+). */
  placements?: AdPlacement[];
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
  objective: CampaignObjective;
  useExistingPost: boolean; // تعزيز المنشور الحالي بدل إنشاء مبدع جديد
  pixelId?: string; // مطلوب لهدف «مبيعات»
  dailyBudgetWhole: number;
  targeting: VideoAdTargeting;
  campaignName: string;
  currency?: string; // إن مُرِّرت نتجنّب استعلاماً إضافياً
}): Promise<LaunchResult> {
  const {
    adAccountId,
    token,
    pageId,
    videoId,
    message,
    destinationUrl,
    cta,
    objective,
    useExistingPost,
    pixelId,
    dailyBudgetWhole,
    targeting,
    campaignName,
  } = params;

  const objSpec = VIDEO_AD_OBJECTIVES[objective];
  const currency =
    params.currency ?? (await getAdAccountCurrency(adAccountId, token));
  const minorBudget = Math.round(dailyBudgetWhole * currencyOffset(currency));
  const thumbnail = await getVideoThumbnail(videoId, token);

  // 1) حملة — بالهدف المختار (مبيعات/تفاعل)، PAUSED.
  const campaign = await graphPost<{ id: string }>(
    `${adAccountId}/campaigns`,
    token,
    {
      name: campaignName,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
      // مطلوب عند الميزانية على مستوى المجموعة (لا ميزانية حملة).
      is_adset_budget_sharing_enabled: false,
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
  // تعطيل «الجمهور المتقدم» (Advantage+) حتى يُحترم العمر/الجنس المحددان بدل
  // توسيعهما تلقائياً. Meta تفرض تحديد هذا الحقل صراحةً (0 أو 1).
  t.targeting_automation = { advantage_audience: 0 };

  const adSet = await graphPost<{ id: string }>(
    `${adAccountId}/adsets`,
    token,
    {
      name: `${campaignName} — مجموعة`,
      campaign_id: campaign.id,
      daily_budget: minorBudget,
      billing_event: "IMPRESSIONS",
      optimization_goal: objSpec.optimization_goal,
      // «مبيعات» تتطلب هدف تحويل عبر بكسل الحساب (حدث الشراء).
      ...(objSpec.needsPixel && pixelId
        ? { promoted_object: { pixel_id: pixelId, custom_event_type: "PURCHASE" } }
        : {}),
      // أقل تكلفة تلقائي — لا يتطلب مبلغ عرض أسعار (bid_amount).
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: t,
      status: "PAUSED",
    },
  );

  // الزر (CTA) يُحدَّد بالهدف — أُثبِت عملياً أن كلا وضعَي المبدع يقبلانه:
  //   مبيعات  → زر رابط (اطلب الآن/تسوّق…) يوجّه لصفحة الهبوط.
  //   تفاعل   → زر «إرسال رسالة» (MESSAGE_PAGE) بلا رابط هبوط.
  const isEngagement = objective === "OUTCOME_ENGAGEMENT";
  const callToAction = isEngagement
    ? { type: "MESSAGE_PAGE" }
    : { type: cta, value: { link: destinationUrl } };

  // 3) المبدع — تعزيز المنشور الحالي (object_story_id) أو مبدع جديد؛ كلاهما بزر.
  let creativeSpec: Record<string, unknown>;
  if (useExistingPost) {
    // يعزّز المنشور المنشور فعلاً (بتفاعله) مع إضافة الزر على مستوى الإعلان —
    // الزر يظهر في الإعلان فقط ولا يُغيّر المنشور الأصلي. صيغة {pageId}_{postId}.
    const postId = await getVideoPostId(videoId, token);
    if (!postId) throw new Error("تعذّر جلب معرّف المنشور للفيديو");
    const storyId = postId.includes("_") ? postId : `${pageId}_${postId}`;
    creativeSpec = {
      name: `${campaignName} — مبدع`,
      object_story_id: storyId,
      call_to_action: callToAction,
    };
  } else {
    const videoData: Record<string, unknown> = {
      video_id: videoId,
      message,
      call_to_action: callToAction,
      ...(isEngagement ? {} : { link_description: destinationUrl }),
    };
    if (thumbnail) videoData.image_url = thumbnail;
    creativeSpec = {
      name: `${campaignName} — مبدع`,
      object_story_spec: { page_id: pageId, video_data: videoData },
    };
  }

  const creative = await graphPost<{ id: string }>(
    `${adAccountId}/adcreatives`,
    token,
    creativeSpec,
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
