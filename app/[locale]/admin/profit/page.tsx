import { auth } from "@/auth";
import ProfitDatePicker from "@/components/admin/profit-date-picker";
import ProfitExportButton from "@/components/admin/profit-export-button";
import ProfitDashboard from "@/components/admin/profit/profit-dashboard";
import { getOrderProfitStats } from "@/lib/actions/order.actions";
import { getExpenseStatsForPeriod } from "@/lib/actions/expense.actions";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "تحليل الأرباح",
};

const ProfitPage = async (props: {
  searchParams: Promise<{ from: string; to: string }>;
}) => {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const searchParams = await props.searchParams;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const parseDate = (s: string) => new Date(`${s}T12:00:00.000Z`);
  const defaultFrom = searchParams.from
    ? parseDate(searchParams.from)
    : startOfMonth;
  const defaultTo = searchParams.to ? parseDate(searchParams.to) : now;

  // Immediately preceding window of the same length, for the delta badges.
  const DAY = 24 * 60 * 60 * 1000;
  const spanMs = Math.max(0, defaultTo.getTime() - defaultFrom.getTime());
  const prevTo = new Date(defaultFrom.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - spanMs);

  const [current, expenseStats, previous, prevExpenses] = await Promise.all([
    getOrderProfitStats({ from: defaultFrom, to: defaultTo }),
    getExpenseStatsForPeriod(defaultFrom, defaultTo),
    getOrderProfitStats({ from: prevFrom, to: prevTo }),
    getExpenseStatsForPeriod(prevFrom, prevTo),
  ]);

  const { productStats, dailySeries, orderSummary, fefoActive, fefoFallbackQty } =
    current;

  const productTotals = productStats.reduce(
    (acc, item) => ({
      totalRevenue: acc.totalRevenue + item.totalRevenue,
      totalCost: acc.totalCost + item.totalCost,
      totalProfit: acc.totalProfit + item.totalProfit,
    }),
    { totalRevenue: 0, totalCost: 0, totalProfit: 0 },
  );

  // Previous period, net of that period's own expenses, so the comparison is
  // like-for-like against the current "صافي الربح الحقيقي".
  const prevRevenue = previous.productStats.reduce(
    (s, p) => s + p.totalRevenue,
    0,
  );
  const prevNetProfit =
    previous.productStats.reduce((s, p) => s + p.totalProfit, 0) -
    prevExpenses.totalOverheadCost;
  const comparison =
    previous.orderSummary.totalOrderCount > 0
      ? {
          collected: previous.orderSummary.totalGrossRevenue,
          netProfit: prevNetProfit,
          margin: prevRevenue > 0 ? (prevNetProfit / prevRevenue) * 100 : 0,
          orders: previous.orderSummary.totalOrderCount,
        }
      : null;

  const fromLabel = searchParams.from || defaultFrom.toISOString().split("T")[0];
  const toLabel = searchParams.to || defaultTo.toISOString().split("T")[0];

  return (
    <div className="space-y-0">
      {/* Header — folded into the content area since the admin shell already
          provides the top nav bar. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold">تحليل الأرباح</h1>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
                {orderSummary.totalOrderCount} طلب مكتمل
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              نظرة شاملة على الإيرادات، التكاليف، وصافي الربح للفترة المحددة
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <ProfitExportButton
            productStats={productStats}
            adByProduct={expenseStats.adByProduct}
            from={fromLabel}
            to={toLabel}
            summary={orderSummary}
            totalCost={productTotals.totalCost}
            totalAdCost={expenseStats.totalAdCost}
            totalExpenses={expenseStats.totalExpenses}
            trueNetProfit={
              productTotals.totalProfit - expenseStats.totalOverheadCost
            }
          />
          <ProfitDatePicker defaultFrom={fromLabel} defaultTo={toLabel} />
        </div>
      </div>

      <ProfitDashboard
        productStats={productStats}
        dailySeries={dailySeries}
        orderSummary={orderSummary}
        fefoActive={fefoActive}
        fefoFallbackQty={fefoFallbackQty}
        expenses={{
          totalAdCost: expenseStats.totalAdCost,
          totalExpenses: expenseStats.totalExpenses,
          adByProduct: expenseStats.adByProduct,
          expenseByCategory: expenseStats.expenseByCategory,
        }}
        comparison={comparison}
      />
    </div>
  );
};

export default ProfitPage;
