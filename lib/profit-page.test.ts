import { renderToStaticMarkup } from "react-dom/server";
import ProfitPage from "@/app/[locale]/admin/profit/page";
import { getOrderProfitStats } from "@/lib/actions/order.actions";
import { getExpenseStatsForPeriod } from "@/lib/actions/expense.actions";
import { getProductCampaignBreakdown } from "@/lib/actions/adspend.actions";

jest.mock("@/auth", () => ({ auth: async () => ({ user: { role: "admin" } }) }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/components/admin/profit-date-picker", () => ({
  __esModule: true, default: () => null,
}));
jest.mock("@/components/admin/profit/profit-dashboard", () => ({
  __esModule: true, default: () => null,
}));
jest.mock("@/lib/actions/order.actions", () => ({ getOrderProfitStats: jest.fn() }));
jest.mock("@/lib/actions/expense.actions", () => ({ getExpenseStatsForPeriod: jest.fn() }));
jest.mock("@/lib/actions/adspend.actions", () => ({
  getLastSync: async () => null,
  getProductCampaignBreakdown: jest.fn().mockResolvedValue({}),
}));

describe("profit page applied period", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-10-24T10:00:00Z"));
    jest.mocked(getOrderProfitStats).mockImplementation(async ({ to }) => ({
      productStats: [], dailySeries: [], inconsistentOrders: [],
      orderSummary: { totalOrderCount: to?.toISOString().startsWith("2026-09-30") ? 1269 : 1511 },
    }) as unknown as Awaited<ReturnType<typeof getOrderProfitStats>>);
    jest.mocked(getExpenseStatsForPeriod).mockResolvedValue({
      totalOverheadCost: 0,
    } as Awaited<ReturnType<typeof getExpenseStatsForPeriod>>);
  });
  afterEach(() => jest.useRealTimers());

  it("uses the selected end date for orders, expenses, campaigns and the preceding comparison", async () => {
    const page = await ProfitPage({ searchParams: Promise.resolve({ from: "2026-08-01", to: "2026-09-30" }) });
    const from = new Date("2026-08-01T12:00:00Z");
    const to = new Date("2026-09-30T12:00:00Z");
    expect(getOrderProfitStats).toHaveBeenNthCalledWith(1, { from, to });
    expect(getExpenseStatsForPeriod).toHaveBeenNthCalledWith(1, from, to);
    expect(getProductCampaignBreakdown).toHaveBeenCalledWith(from, to);
    const prevFrom = new Date("2026-06-01T12:00:00Z");
    const prevTo = new Date("2026-07-31T12:00:00Z");
    expect(getOrderProfitStats).toHaveBeenNthCalledWith(2, { from: prevFrom, to: prevTo });
    expect(getExpenseStatsForPeriod).toHaveBeenNthCalledWith(2, prevFrom, prevTo);
    const html = renderToStaticMarkup(page);
    expect(html).toContain("1269 طلب مكتمل");
    expect(html).toContain("<bdi>2026-09-30</bdi>");
  });

  it("defaults to the Iraq calendar day only when no end date is provided", async () => {
    jest.setSystemTime(new Date("2026-10-24T22:30:00Z"));
    const page = await ProfitPage({ searchParams: Promise.resolve({ from: "", to: "" }) });
    expect(getOrderProfitStats).toHaveBeenNthCalledWith(1, {
      from: new Date("2026-10-01T12:00:00Z"), to: new Date("2026-10-25T12:00:00Z"),
    });
    expect(renderToStaticMarkup(page)).toContain("<bdi>2026-10-25</bdi>");
  });
});
