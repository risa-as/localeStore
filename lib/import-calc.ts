/**
 * حاسبة الاستيراد — دوال نقية بلا قاعدة بيانات، يستعملها النموذج (للعرض الحي)
 * والخادم (لإعادة الحساب عند الحفظ واللقطة). لا تُقبل نتائج محسوبة من المتصفح.
 *
 * الوحدات:
 *  - حقول *Usd بالدولار.
 *  - حقول *Kiqd بوحدة «الألف د.ع» مثل بقية النظام (7.5 = 7,500 د.ع).
 *  - سعر الصرف fxRate بالدينار الكامل لكل 1$ (مثل جدول FxRate)،
 *    فالتحويل: دولار × fxRate ÷ 1000 = ألف د.ع.
 *
 * الحساب بدقة كاملة دائماً؛ التقريب لأقرب 250 د.ع للعرض فقط (roundForDisplay).
 */

export type ImportInputs = {
  quantity: number;
  unitPriceUsd: number;
  /** الشحن من الصين إلى العراق للشحنة كاملة. */
  intlShippingUsd: number;
  /** تُطبَّق على (البضاعة + الشحن الدولي). */
  alibabaFeePct: number;
  /** تُطبَّق على كل ما يُدفع بالبطاقة: البضاعة + الشحن + عمولة علي بابا. */
  cardFeePct: number;
  cardFixedUsd: number;
  fxRate: number;
  customsKiqd: number;
  /** عينات أو أي تكلفة لمرة واحدة — تُوزَّع على قطع الشحنة. */
  oneOffKiqd: number;
  /** تغليف وما شابه لكل قطعة. */
  opsCostPerUnitKiqd: number;
  /** صافي ما تقبضه عن القطعة (بعد العروض). */
  sellingPriceKiqd: number;
  /** ما تدفعه للمندوب ناقص ما يدفعه الزبون للتوصيل، لكل طلب. */
  netDeliveryPerOrderKiqd: number;
  unitsPerOrder: number;
  /** تكلفة الإعلان لكل طلب محسوم (مسلَّم أو راجع). */
  cpaUsd: number;
  deliveryRatePct: number;
};

export type ScenarioResult = {
  cpaUsd: number;
  deliveryRatePct: number;
  adPerUnitKiqd: number;
  profitPerUnitKiqd: number;
  marginPct: number;
  totalProfitKiqd: number;
};

export type ImportResult = {
  goodsUsd: number;
  alibabaFeeUsd: number;
  cardFeeUsd: number;
  shipmentUsd: number;
  /** كل ما يُدفع للشحنة بالدينار (بلا تكاليف التشغيل للقطعة). */
  shipmentKiqd: number;
  /** التكلفة الواصلة للقطعة = حصتها من الشحنة + تكاليف التشغيل. */
  landedPerUnitKiqd: number;
  deliveryPerUnitKiqd: number;
  adPerUnitKiqd: number;
  profitPerUnitKiqd: number;
  marginPct: number;
  /** رأس المال المجمَّد: الشحنة + تكاليف التشغيل لكل القطع. */
  capitalKiqd: number;
  totalProfitKiqd: number;
  roiPct: number;
  /** أعلى تكلفة إعلان لكل طلب قبل أن يصبح الربح صفراً. */
  breakEvenCpaUsd: number;
  /** سعر البيع الذي لا ربح عنده ولا خسارة (بنفس تكلفة الإعلان). */
  breakEvenPriceKiqd: number;
  scenarios: {
    pessimistic: ScenarioResult;
    expected: ScenarioResult;
    optimistic: ScenarioResult;
  };
};

export type ImportSignal = "green" | "yellow" | "red";

/** افتراضات السيناريوهين المتشائم والمتفائل. */
export const SCENARIO_SHIFTS = {
  pessimistic: { cpaFactor: 1.3, deliveryPts: -10 },
  optimistic: { cpaFactor: 0.8, deliveryPts: 5 },
} as const;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** دولار → ألف د.ع. */
export function usdToKiqd(usd: number, fxRate: number) {
  return (n(usd) * n(fxRate)) / 1000;
}

/** ألف د.ع → دولار (0 إذا لا يوجد سعر صرف). */
export function kiqdToUsd(kiqd: number, fxRate: number) {
  return n(fxRate) > 0 ? (n(kiqd) * 1000) / n(fxRate) : 0;
}

/** يقرّب مبلغاً بوحدة الألف د.ع لأقرب 250 دينار — للعرض فقط. */
export function roundForDisplay(kiqd: number) {
  const r = Math.round(n(kiqd) * 4) / 4;
  return Object.is(r, -0) ? 0 : r;
}

/** نسبة التوصيل بين 1٪ و100٪ — الصفر يجعل تكلفة الإعلان لا نهائية. */
const clampRate = (pct: number) => Math.min(100, Math.max(1, n(pct)));

function adPerUnit(cpaUsd: number, deliveryRatePct: number, unitsPerOrder: number, fxRate: number) {
  const rate = clampRate(deliveryRatePct) / 100;
  const upo = n(unitsPerOrder) > 0 ? n(unitsPerOrder) : 1;
  return usdToKiqd(cpaUsd, fxRate) / rate / upo;
}

export function computeImport(raw: ImportInputs): ImportResult {
  const i = {
    quantity: Math.max(0, Math.floor(n(raw.quantity))),
    unitPriceUsd: n(raw.unitPriceUsd),
    intlShippingUsd: n(raw.intlShippingUsd),
    alibabaFeePct: n(raw.alibabaFeePct),
    cardFeePct: n(raw.cardFeePct),
    cardFixedUsd: n(raw.cardFixedUsd),
    fxRate: n(raw.fxRate),
    customsKiqd: n(raw.customsKiqd),
    oneOffKiqd: n(raw.oneOffKiqd),
    opsCostPerUnitKiqd: n(raw.opsCostPerUnitKiqd),
    sellingPriceKiqd: n(raw.sellingPriceKiqd),
    netDeliveryPerOrderKiqd: n(raw.netDeliveryPerOrderKiqd),
    unitsPerOrder: n(raw.unitsPerOrder) > 0 ? n(raw.unitsPerOrder) : 1,
    cpaUsd: n(raw.cpaUsd),
    deliveryRatePct: clampRate(raw.deliveryRatePct),
  };

  const goodsUsd = i.unitPriceUsd * i.quantity;
  const alibabaFeeUsd = ((goodsUsd + i.intlShippingUsd) * i.alibabaFeePct) / 100;
  const cardBase = goodsUsd + i.intlShippingUsd + alibabaFeeUsd;
  const cardFeeUsd = (cardBase * i.cardFeePct) / 100 + (cardBase > 0 ? i.cardFixedUsd : 0);
  const shipmentUsd = cardBase + cardFeeUsd;
  const shipmentKiqd = usdToKiqd(shipmentUsd, i.fxRate) + i.customsKiqd + i.oneOffKiqd;

  const landedPerUnitKiqd = i.quantity > 0 ? shipmentKiqd / i.quantity + i.opsCostPerUnitKiqd : 0;
  const deliveryPerUnitKiqd = i.netDeliveryPerOrderKiqd / i.unitsPerOrder;
  const capitalKiqd = shipmentKiqd + i.opsCostPerUnitKiqd * i.quantity;

  // الربح قبل الإعلان لكل قطعة — منه تُشتق نقطتا التعادل.
  const contribution = i.sellingPriceKiqd - landedPerUnitKiqd - deliveryPerUnitKiqd;

  const scenario = (cpaUsd: number, deliveryRatePct: number): ScenarioResult => {
    const rate = clampRate(deliveryRatePct);
    const ad = adPerUnit(cpaUsd, rate, i.unitsPerOrder, i.fxRate);
    const profit = contribution - ad;
    return {
      cpaUsd,
      deliveryRatePct: rate,
      adPerUnitKiqd: ad,
      profitPerUnitKiqd: profit,
      marginPct: i.sellingPriceKiqd > 0 ? (profit / i.sellingPriceKiqd) * 100 : 0,
      totalProfitKiqd: profit * i.quantity,
    };
  };

  const expected = scenario(i.cpaUsd, i.deliveryRatePct);
  const pessimistic = scenario(
    i.cpaUsd * SCENARIO_SHIFTS.pessimistic.cpaFactor,
    i.deliveryRatePct + SCENARIO_SHIFTS.pessimistic.deliveryPts,
  );
  const optimistic = scenario(
    i.cpaUsd * SCENARIO_SHIFTS.optimistic.cpaFactor,
    i.deliveryRatePct + SCENARIO_SHIFTS.optimistic.deliveryPts,
  );

  // أعلى تكلفة إعلان لكل طلب: contribution = cpa×k ÷ rate ÷ upo.
  const breakEvenCpaUsd = Math.max(
    0,
    kiqdToUsd(contribution * i.unitsPerOrder * (i.deliveryRatePct / 100), i.fxRate),
  );

  return {
    goodsUsd,
    alibabaFeeUsd,
    cardFeeUsd,
    shipmentUsd,
    shipmentKiqd,
    landedPerUnitKiqd,
    deliveryPerUnitKiqd,
    adPerUnitKiqd: expected.adPerUnitKiqd,
    profitPerUnitKiqd: expected.profitPerUnitKiqd,
    marginPct: expected.marginPct,
    capitalKiqd,
    totalProfitKiqd: expected.totalProfitKiqd,
    roiPct: capitalKiqd > 0 ? (expected.totalProfitKiqd / capitalKiqd) * 100 : 0,
    breakEvenCpaUsd,
    breakEvenPriceKiqd: landedPerUnitKiqd + deliveryPerUnitKiqd + expected.adPerUnitKiqd,
    scenarios: { pessimistic, expected, optimistic },
  };
}

/** أخضر: هامش ≥ الهدف ويربح حتى في المتشائم. أحمر: لا يربح في المتوقع. */
export function importSignal(result: ImportResult, targetMarginPct: number): ImportSignal {
  if (!(result.profitPerUnitKiqd > 0)) return "red";
  if (result.marginPct >= n(targetMarginPct) && result.scenarios.pessimistic.profitPerUnitKiqd > 0) return "green";
  return "yellow";
}

// ─── إعادة الاستيراد: من الأرقام الفعلية إلى مدخلات الحاسبة ─────────────────

/** أرقام منتج موجود خلال نافذة زمنية — كلها من نفس منطق صفحة الأرباح. */
export type ProductHistory = {
  /** قطع مسلَّمة ومحصَّلة (حالات الإيراد). */
  deliveredUnits: number;
  deliveredOrders: number;
  returnedOrders: number;
  /** صافي الإيراد (بعد العروض وبعد خصم تكلفة التوصيل الفعلية) — ألف د.ع. */
  netRevenueKiqd: number;
  /** تكلفة البضاعة المباعة — ألف د.ع. */
  cogsKiqd: number;
  /** الصرف الإعلاني على المنتج في النافذة — ألف د.ع. */
  adSpendKiqd: number;
};

export type HistoryDerived = {
  resolvedOrders: number;
  sellingPriceKiqd: number;
  unitsPerOrder: number;
  deliveryRatePct: number;
  /** تكلفة الإعلان لكل طلب محسوم بالألف د.ع. */
  cpaKiqd: number;
  adPerDeliveredUnitKiqd: number;
  cogsPerUnitKiqd: number;
  /** ربح القطعة الفعلي بعد الإعلان كما في صفحة الأرباح. */
  profitPerUnitKiqd: number;
};

export function deriveFromHistory(h: ProductHistory): HistoryDerived {
  const units = n(h.deliveredUnits);
  const delivered = n(h.deliveredOrders);
  const resolved = delivered + n(h.returnedOrders);
  const ad = n(h.adSpendKiqd);
  return {
    resolvedOrders: resolved,
    sellingPriceKiqd: units > 0 ? n(h.netRevenueKiqd) / units : 0,
    unitsPerOrder: delivered > 0 && units > 0 ? units / delivered : 1,
    deliveryRatePct: resolved > 0 ? (delivered / resolved) * 100 : 0,
    cpaKiqd: resolved > 0 ? ad / resolved : 0,
    adPerDeliveredUnitKiqd: units > 0 ? ad / units : 0,
    cogsPerUnitKiqd: units > 0 ? n(h.cogsKiqd) / units : 0,
    profitPerUnitKiqd: units > 0 ? (n(h.netRevenueKiqd) - n(h.cogsKiqd) - ad) / units : 0,
  };
}

/**
 * القيم التي تُعبّأ في الحاسبة من التاريخ الفعلي.
 * سعر البيع صافٍ أصلاً من التوصيل (صفحة الأرباح تخصمه)، لذا صافي التوصيل = 0
 * حتى لا يُخصم مرتين. وتكلفة الإعلان لكل طلب محسوم (مسلَّم + راجع)، فالحاسبة
 * حين تقسمها على نسبة التوصيل تعود بالضبط إلى «الإعلان ÷ القطع المسلَّمة».
 */
export function historyToInputs(d: HistoryDerived, fxRate: number) {
  return {
    sellingPriceKiqd: d.sellingPriceKiqd,
    netDeliveryPerOrderKiqd: 0,
    unitsPerOrder: d.unitsPerOrder,
    deliveryRatePct: d.deliveryRatePct,
    cpaUsd: kiqdToUsd(d.cpaKiqd, fxRate),
  };
}

/** توقيت إعادة الطلب من سرعة البيع والمخزون. */
export function reorderAdvice(args: {
  stock: number;
  unitsPerDay: number;
  leadTimeDays: number;
  coverDays: number;
  moq?: number | null;
}) {
  const perDay = n(args.unitsPerDay);
  const stock = Math.max(0, n(args.stock));
  const daysToStockout = perDay > 0 ? stock / perDay : null;
  const lead = Math.max(0, n(args.leadTimeDays));
  const orderNow = daysToStockout !== null && daysToStockout <= lead;
  // يغطي مدة الشحن + أيام التغطية، ناقص ما يتبقى عند الوصول.
  const needed = perDay * (lead + n(args.coverDays)) - stock;
  const suggestedQty = Math.max(n(args.moq ?? 0), Math.ceil(Math.max(0, needed)));
  return {
    daysToStockout,
    orderNow,
    /** أيام متبقية قبل أن يجب الطلب (سالب = متأخر). */
    daysUntilOrder: daysToStockout !== null ? daysToStockout - lead : null,
    suggestedQty: perDay > 0 ? suggestedQty : 0,
  };
}
