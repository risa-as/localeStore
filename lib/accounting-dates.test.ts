import { accountingDay, inclusiveDays, overlappingDays } from "./accounting-dates";

describe("calendar-date accounting", () => {
  it("includes a one-day expense in a report opened at noon", () => {
    expect(overlappingDays(new Date("2026-09-12"), new Date("2026-09-12"), new Date("2026-09-12T12:00:00Z"), new Date("2026-09-12T12:00:00Z"))).toBe(1);
  });
  it("counts only overlap across month boundaries", () => {
    expect(overlappingDays(new Date("2026-08-30"), new Date("2026-09-03"), new Date("2026-09-01"), new Date("2026-09-30"))).toBe(3);
    expect(inclusiveDays(new Date("2026-09-12"), new Date("2026-09-11"))).toBe(0);
  });
  it("rejects invalid dates", () => expect(() => accountingDay("bad")).toThrow());
});
