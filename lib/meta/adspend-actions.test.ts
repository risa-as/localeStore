import { importPeriodSpend, getFxRates, linkCampaignsBulk } from "../actions/adspend.actions";
import { requireAdministrator } from "../authorization";
import { prisma } from "@/db/prisma";
import { syncSpendForRange } from "./adspend";
import { saveCampaignProductLink } from "./adspend-storage";

jest.mock("../authorization", () => ({ requireAdministrator: jest.fn() }));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/db/prisma", () => ({ prisma: {
  metaConnection: { findUnique: jest.fn() }, fxRate: { findFirst: jest.fn(), findMany: jest.fn() },
  adSpendDaily: { groupBy: jest.fn() },
  product: { findMany: jest.fn() },
} }));
jest.mock("./adspend", () => ({ syncSpendForRange: jest.fn(), toBaghdadDateStr: () => "2026-10-23" }));
jest.mock("./adspend-storage", () => ({ saveCampaignProductLink: jest.fn() }));
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(prisma.metaConnection.findUnique).mockResolvedValue({ userAccessToken: "SECRET" } as never);
  jest.mocked(prisma.fxRate.findFirst).mockResolvedValue({ rate: 1577, fromDate: new Date("2026-10-06") } as never);
});
it("does not claim a complete import when some days have no FX rate, even if other rows were saved", async () => {
  jest.mocked(syncSpendForRange).mockResolvedValueOnce({ ok: false, days: 2, rows: 2, skippedNoFx: 3, accountsErr: 0,
    missingFx: [{ date: "2026-10-05", currency: "USD", amount: 34.54, rows: 3 }] } as never);
  const result = await importPeriodSpend({ from: "2026-10-05", to: "2026-10-06", accountIds: ["act_1"] });
  expect(result).toMatchObject({ success: false, days: 2, rows: 2, skippedNoFx: 3 });
  expect(result.message).toContain("2026-10-05: 34.54 USD");
});
it("authorizes historical imports before reading credentials or writing accounting rows", async () => {
  jest.mocked(requireAdministrator).mockRejectedValue(new Error("Unauthorized"));
  await expect(importPeriodSpend({ from: "2026-10-05", to: "2026-10-05" })).rejects.toThrow();
  expect(prisma.metaConnection.findUnique).not.toHaveBeenCalled();
  expect(syncSpendForRange).not.toHaveBeenCalled();
});
it("moves historical spending when campaigns are linked", async () => {
  jest.mocked(prisma.product.findMany).mockResolvedValue([{ id: "p1" }] as never);
  jest.mocked(saveCampaignProductLink).mockResolvedValue(3);
  const result = await linkCampaignsBulk([{ campaignId: "c1", productId: "p1" }]);
  expect(result).toMatchObject({ success: true, linked: 1, failed: 0 });
  expect(result.message).toContain("3 صف");
  expect(saveCampaignProductLink).toHaveBeenCalledWith({ campaignId: "c1", productId: "p1" });
});
it("returns the actual stored usage of each FX rate rather than inferring it from the active rate", async () => {
  jest.mocked(prisma.fxRate.findMany).mockResolvedValue([
    { id: "new", rate: 1577, fromDate: new Date("2026-10-06"), toDate: null },
    { id: "old", rate: 1370, fromDate: new Date("2026-02-08"), toDate: new Date("2026-10-05") },
  ] as never);
  jest.mocked(prisma.adSpendDaily.groupBy).mockResolvedValue([
    { fxRate: 1577, _count: { _all: 41 }, _sum: { amount: "965.89" } },
    { fxRate: 1370, _count: { _all: 257 }, _sum: { amount: "6080.11" } },
  ] as never);
  expect(await getFxRates()).toEqual(expect.arrayContaining([
    expect.objectContaining({ rate: 1577, appliedDays: 41, appliedUsd: 965.89 }),
    expect.objectContaining({ rate: 1370, appliedDays: 257, appliedUsd: 6080.11 }),
  ]));
});
