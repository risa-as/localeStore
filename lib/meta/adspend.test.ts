import { prisma } from "@/db/prisma";
import { graphGetAll } from "./graph";
import { fxRateForDate, syncSpendForDate, syncSpendForRange, fetchCampaignSpendForRange } from "./adspend";
import { persistDailySpend } from "./adspend-storage";
import { fxPeriodIncludes } from "../fx-periods";

jest.mock("@/db/prisma", () => ({ prisma: {
  fxRate: { findFirst: jest.fn(), findMany: jest.fn() }, campaignProductMap: { findMany: jest.fn() },
  metaAdLaunch: { findMany: jest.fn() }, adSpendDaily: { upsert: jest.fn() }, adSpendSyncLog: { create: jest.fn() },
} }));
jest.mock("./graph", () => ({ graphGetAll: jest.fn() }));
jest.mock("./adspend-storage", () => ({ persistDailySpend: jest.fn() }));
const rates = [
  { id: "new", rate: 1577, fromDate: new Date("2026-10-06"), toDate: null },
  { id: "old", rate: 1370, fromDate: new Date("2026-02-08"), toDate: new Date("2026-10-05") },
];
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(prisma.fxRate.findMany).mockResolvedValue(rates as never);
  jest.mocked(prisma.campaignProductMap.findMany).mockResolvedValue([
    { campaignId: "c1", productId: "p1" }, { campaignId: "c2", productId: "p2" }, { campaignId: "c3", productId: "p3" },
  ] as never);
  jest.mocked(prisma.metaAdLaunch.findMany).mockResolvedValue([]);
  jest.mocked(prisma.fxRate.findFirst).mockImplementation(args => {
    const where = args!.where! as { fromDate: { lte: Date }; OR: { toDate: null | { gte?: Date; gt?: Date } }[] };
    const end = where.OR[1].toDate!;
    return Promise.resolve(rates.find(rate => rate.fromDate <= where.fromDate.lte && (rate.toDate === null ||
      (end.gte ? rate.toDate >= end.gte : end.gt ? rate.toDate > end.gt : false))) || null) as never;
  });
  jest.mocked(graphGetAll).mockImplementation(async path => path === "me/adaccounts" ? [
    { id: "act_1", account_id: "1", currency: "USD", account_status: 1 },
  ] : [
    { campaign_id: "c1", spend: "9.96" }, { campaign_id: "c2", spend: "18.22" }, { campaign_id: "c3", spend: "6.36" },
  ]);
});

it("includes the FX end day and switches rates only on the following start day", async () => {
  expect(await fxRateForDate(new Date("2026-10-05T16:00:00Z"))).toEqual({ id: "old", rate: 1370 });
  expect(await fxRateForDate(new Date("2026-10-06"))).toEqual({ id: "new", rate: 1577 });
  expect(await fxRateForDate(new Date("2026-02-07"))).toBeNull();
  expect(fxPeriodIncludes(rates[1], new Date("2026-10-05T20:00:00Z"))).toBe(true);
  expect(fxPeriodIncludes(rates[1], new Date("2026-10-06"))).toBe(false);
});
it("imports the reported missing October 5 spends at 1370 without changing their date", async () => {
  const result = await syncSpendForDate("SECRET", new Date("2026-10-05"), { log: false });
  expect(result).toMatchObject({ ok: true, rows: 3, skippedNoFx: 0, missingFx: [] });
  const writes = jest.mocked(persistDailySpend).mock.calls.map(([input]) => input);
  expect(writes.reduce((total, row) => total + Number(row.amount), 0)).toBeCloseTo(34.54);
  expect(writes.reduce((total, row) => total + Number(row.amountIQD), 0)).toBeCloseTo(47319.8);
  expect(writes.every(row => row.fxRate === 1370 && (row.date as Date).toISOString().slice(0, 10) === "2026-10-05")).toBe(true);
});
it("reports missing exchange-rate amounts as incomplete rather than a successful sync", async () => {
  jest.mocked(prisma.fxRate.findFirst).mockResolvedValue(null);
  const result = await syncSpendForDate("SECRET", new Date("2026-10-05"));
  expect(result).toMatchObject({ ok: false, rows: 0, skippedNoFx: 3,
    missingFx: [{ date: "2026-10-05", currency: "USD", amount: 34.54, rows: 3 }] });
  expect(persistDailySpend).not.toHaveBeenCalled();
  expect(prisma.adSpendSyncLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ok: false, message: expect.stringContaining("34.54 USD") }) }));
});
it("uses complete campaign insights for the live range view", async () => {
  jest.mocked(graphGetAll).mockResolvedValue([{ campaign_id: "c1", spend: "12.34" }, { campaign_id: "c2", spend: "4.56" }]);
  const rows = await fetchCampaignSpendForRange("act_1", "SECRET", "2026-10-01", "2026-10-23");
  expect(rows.map(row => row.spend)).toEqual([12.34, 4.56]);
  expect(JSON.stringify(rows)).not.toContain("SECRET");
});
it("imports multiple daily amounts with one insights request per account and each day's FX rate", async () => {
  jest.mocked(graphGetAll).mockImplementation(async path => path === "me/adaccounts" ? [
    { id: "act_1", account_id: "1", currency: "USD", account_status: 1 },
  ] : [{ campaign_id: "c1", spend: "10.00", date_start: "2026-10-05" }, { campaign_id: "c1", spend: "12.00", date_start: "2026-10-06" }]);
  const result = await syncSpendForRange("SECRET", "2026-10-05", "2026-10-06");
  expect(result).toMatchObject({ ok: true, days: 2, rows: 2, accountsOk: 1 });
  expect(graphGetAll).toHaveBeenCalledTimes(2);
  expect(graphGetAll).toHaveBeenLastCalledWith("act_1/insights", "SECRET", expect.objectContaining({ time_increment: "1" }));
  expect(persistDailySpend).toHaveBeenNthCalledWith(1, expect.objectContaining({ fxRate: 1370, amountIQD: 13700 }));
  expect(persistDailySpend).toHaveBeenNthCalledWith(2, expect.objectContaining({ fxRate: 1577, amountIQD: 18924 }));
});
it("reports an incomplete range import when an account fails", async () => {
  jest.mocked(graphGetAll).mockImplementation(async path => {
    if (path === "me/adaccounts") return [{ id: "act_1", account_id: "1", currency: "USD", account_status: 1 }];
    throw new Error("API unavailable");
  });
  expect(await syncSpendForRange("SECRET", "2026-10-01", "2026-10-24")).toMatchObject({ ok: false, rows: 0, accountsErr: 1 });
  expect(persistDailySpend).not.toHaveBeenCalled();
});
