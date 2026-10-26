import { manualAdPortion } from "./manual-ad-coverage";
const params = { amount: 100, from: new Date("2026-09-01"), to: new Date("2026-09-10"), periodFrom: new Date("2026-09-01T12:00Z"), periodTo: new Date("2026-09-10T12:00Z") };
it("replaces only covered days, without dropping the remainder of a manual campaign", () => {
  expect(manualAdPortion({ ...params, coveredDates: ["2026-09-02", "2026-09-02"] })).toEqual({ amount: 90, replaced: 10, remainingDays: 9 });
});
it("prorates a narrower period and ignores coverage outside it", () => {
  expect(manualAdPortion({ ...params, periodFrom: new Date("2026-09-05"), periodTo: new Date("2026-09-06"), coveredDates: ["2026-09-02", "2026-09-05"] }).amount).toBe(10);
});
