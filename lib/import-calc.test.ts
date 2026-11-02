import {
  computeImport,
  deriveFromHistory,
  historyToInputs,
  importSignal,
  kiqdToUsd,
  reorderAdvice,
  roundForDisplay,
  usdToKiqd,
  type ImportInputs,
} from "./import-calc";

const base: ImportInputs = {
  quantity: 100,
  unitPriceUsd: 3,
  intlShippingUsd: 100,
  alibabaFeePct: 0,
  cardFeePct: 0,
  cardFixedUsd: 0,
  fxRate: 1500,
  customsKiqd: 0,
  oneOffKiqd: 0,
  opsCostPerUnitKiqd: 0,
  sellingPriceKiqd: 25,
  netDeliveryPerOrderKiqd: 0,
  unitsPerOrder: 1,
  cpaUsd: 2,
  deliveryRatePct: 80,
};

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe("units — thousands of IQD like the rest of the store", () => {
  it("converts 5 USD at 1500 to 7.5 thousand", () => {
    expect(usdToKiqd(5, 1500)).toBe(7.5);
    expect(kiqdToUsd(7.5, 1500)).toBe(5);
  });

  it("stores 50 IQD of packaging as 0.05 and keeps it exact in the math", () => {
    const r = computeImport({ ...base, opsCostPerUnitKiqd: 0.05 });
    const without = computeImport(base);
    close(r.landedPerUnitKiqd - without.landedPerUnitKiqd, 0.05);
  });
});

describe("computeImport", () => {
  it("spreads shipment costs over units and adds per-unit ops cost", () => {
    // (300 goods + 100 shipping) × 1.5 = 600 thousand ÷ 100 = 6 per unit
    const r = computeImport(base);
    close(r.shipmentKiqd, 600);
    close(r.landedPerUnitKiqd, 6);
  });

  it("applies Alibaba fee on goods + shipping and the card fee on everything paid by card", () => {
    const r = computeImport({ ...base, alibabaFeePct: 3, cardFeePct: 2, cardFixedUsd: 1 });
    close(r.alibabaFeeUsd, 12); // 3% of 400
    close(r.cardFeeUsd, (412 * 2) / 100 + 1);
    close(r.shipmentUsd, 412 + 8.24 + 1);
  });

  it("charges ads per delivered unit: CPA ÷ delivery rate ÷ units per order", () => {
    const r = computeImport({ ...base, unitsPerOrder: 2 });
    // 2$ × 1.5 = 3 thousand ÷ 0.8 ÷ 2
    close(r.adPerUnitKiqd, 1.875);
  });

  it("makes profit exactly zero at the break-even CPA", () => {
    const r = computeImport(base);
    const atBreakEven = computeImport({ ...base, cpaUsd: r.breakEvenCpaUsd });
    close(atBreakEven.profitPerUnitKiqd, 0);
  });

  it("makes profit exactly zero at the break-even price", () => {
    const r = computeImport(base);
    const atBreakEven = computeImport({ ...base, sellingPriceKiqd: r.breakEvenPriceKiqd });
    close(atBreakEven.profitPerUnitKiqd, 0);
  });

  it("orders scenarios pessimistic < expected < optimistic", () => {
    const { pessimistic, expected, optimistic } = computeImport(base).scenarios;
    expect(pessimistic.profitPerUnitKiqd).toBeLessThan(expected.profitPerUnitKiqd);
    expect(optimistic.profitPerUnitKiqd).toBeGreaterThan(expected.profitPerUnitKiqd);
  });

  it("never divides by a zero delivery rate", () => {
    const r = computeImport({ ...base, deliveryRatePct: 0 });
    expect(Number.isFinite(r.profitPerUnitKiqd)).toBe(true);
  });

  it("keeps full precision — rounding happens only for display", () => {
    const r = computeImport({ ...base, unitPriceUsd: 3.17, intlShippingUsd: 0 });
    close(r.landedPerUnitKiqd, 4.755);
    expect(roundForDisplay(r.landedPerUnitKiqd)).toBe(4.75);
  });
});

describe("roundForDisplay", () => {
  it("rounds to the nearest 250 IQD", () => {
    expect(roundForDisplay(12.703)).toBe(12.75);
    expect(roundForDisplay(12.62)).toBe(12.5);
    expect(roundForDisplay(-0.01)).toBe(0);
  });
});

describe("importSignal", () => {
  it("is red when the expected case loses money", () => {
    expect(importSignal(computeImport({ ...base, sellingPriceKiqd: 5 }), 25)).toBe("red");
  });
  it("is green when margin meets the target and the worst case still profits", () => {
    expect(importSignal(computeImport({ ...base, sellingPriceKiqd: 40 }), 25)).toBe("green");
  });
  it("is yellow otherwise", () => {
    expect(importSignal(computeImport({ ...base, sellingPriceKiqd: 11 }), 25)).toBe("yellow");
  });
});

describe("re-import from history", () => {
  // A product over the window: 120 units in 100 delivered orders, 25 returned
  // orders, collected 3000 thousand net of delivery, cost 900, ads 500.
  const history = {
    deliveredUnits: 120,
    deliveredOrders: 100,
    returnedOrders: 25,
    netRevenueKiqd: 3000,
    cogsKiqd: 900,
    adSpendKiqd: 500,
  };

  it("derives rates from orders, not units", () => {
    const d = deriveFromHistory(history);
    expect(d.deliveryRatePct).toBe(80);
    expect(d.unitsPerOrder).toBe(1.2);
    expect(d.cpaKiqd).toBe(4); // 500 ÷ 125 resolved orders
  });

  it("reproduces the profit report per unit when fed back into the calculator", () => {
    const d = deriveFromHistory(history);
    const fx = 1310;
    const inputs = historyToInputs(d, fx);
    // Landed cost = the historical cost per unit, no extra per-unit costs.
    const r = computeImport({
      ...base,
      ...inputs,
      fxRate: fx,
      quantity: 1000,
      unitPriceUsd: kiqdToUsd(d.cogsPerUnitKiqd, fx),
      intlShippingUsd: 0,
    });
    // No double counting of delivery or returns: matches (revenue − cost − ads) ÷ units.
    close(r.adPerUnitKiqd, 500 / 120);
    close(r.profitPerUnitKiqd, (3000 - 900 - 500) / 120);
    close(r.profitPerUnitKiqd, d.profitPerUnitKiqd);
  });

  it("handles a product with no sales in the window", () => {
    const d = deriveFromHistory({ ...history, deliveredUnits: 0, deliveredOrders: 0, returnedOrders: 0 });
    expect(d.sellingPriceKiqd).toBe(0);
    expect(d.unitsPerOrder).toBe(1);
  });
});

describe("reorderAdvice", () => {
  it("says order now when stock runs out before a new shipment arrives", () => {
    const a = reorderAdvice({ stock: 30, unitsPerDay: 2, leadTimeDays: 20, coverDays: 60 });
    expect(a.daysToStockout).toBe(15);
    expect(a.orderNow).toBe(true);
    expect(a.suggestedQty).toBe(130); // 2 × 80 − 30
  });

  it("respects the supplier minimum", () => {
    const a = reorderAdvice({ stock: 500, unitsPerDay: 1, leadTimeDays: 20, coverDays: 60, moq: 200 });
    expect(a.orderNow).toBe(false);
    expect(a.suggestedQty).toBe(200);
  });

  it("gives no advice without sales", () => {
    const a = reorderAdvice({ stock: 10, unitsPerDay: 0, leadTimeDays: 20, coverDays: 60 });
    expect(a.daysToStockout).toBeNull();
    expect(a.suggestedQty).toBe(0);
  });
});
