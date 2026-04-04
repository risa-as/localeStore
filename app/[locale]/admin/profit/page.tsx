import { auth } from "@/auth";
import ProfitDatePicker from "@/components/admin/profit-date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getOrderProfitStats } from "@/lib/actions/order.actions";
import { getExpenseStatsForPeriod } from "@/lib/actions/expense.actions";
import { formatCurrency } from "@/lib/utils";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  Truck,
  DollarSign,
  BarChart3,
  MapPin,
  Megaphone,
  Receipt,
} from "lucide-react";
import ProfitExportButton from "@/components/admin/profit-export-button";

export const metadata: Metadata = {
  title: "Profit Analysis",
};

function MarginBadge({ margin }: { margin: number }) {
  if (margin >= 40)
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        {margin.toFixed(1)}%
      </Badge>
    );
  if (margin >= 20)
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
        {margin.toFixed(1)}%
      </Badge>
    );
  if (margin > 0)
    return (
      <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100">
        {margin.toFixed(1)}%
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
      {margin.toFixed(1)}%
    </Badge>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  positive,
  neutral,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  positive?: boolean;
  neutral?: boolean;
}) {
  const valueColor = neutral
    ? "text-foreground"
    : positive === true
      ? "text-green-600"
      : positive === false
        ? "text-red-600"
        : "text-foreground";

  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const ProfitPage = async (props: {
  searchParams: Promise<{ from: string; to: string }>;
}) => {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const searchParams = await props.searchParams;
  const t = await getTranslations("Admin");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const parseDate = (s: string) => new Date(`${s}T12:00:00.000Z`);
  const defaultFrom = searchParams.from
    ? parseDate(searchParams.from)
    : startOfMonth;
  const defaultTo = searchParams.to ? parseDate(searchParams.to) : now;

  const [{ productStats, orderSummary }, expenseStats] = await Promise.all([
    getOrderProfitStats({ from: defaultFrom, to: defaultTo }),
    getExpenseStatsForPeriod(defaultFrom, defaultTo),
  ]);

  const productTotals = productStats.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.totalQty,
      totalRevenue: acc.totalRevenue + item.totalRevenue,
      totalCost: acc.totalCost + item.totalCost,
      totalProfit: acc.totalProfit + item.totalProfit,
    }),
    { totalQty: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 },
  );

  const netProfit = productTotals.totalProfit;
  const overallMargin =
    productTotals.totalRevenue > 0
      ? (netProfit / productTotals.totalRevenue) * 100
      : 0;

  // Ad spend per product (lookup map)
  const adByProductMap = new Map(
    expenseStats.adByProduct.map((a) => [a.productId, a.amount]),
  );

  // True net profit after all expenses
  const trueNetProfit = netProfit - expenseStats.totalOverheadCost;
  const trueMargin =
    productTotals.totalRevenue > 0
      ? (trueNetProfit / productTotals.totalRevenue) * 100
      : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("profitAnalysis")}</h1>
            <p className="text-sm text-muted-foreground">
              {orderSummary.totalOrderCount > 0
                ? `${orderSummary.totalOrderCount} طلب مكتمل`
                : "لا توجد طلبات مكتملة في هذه الفترة"}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <ProfitExportButton
            productStats={productStats}
            adByProduct={expenseStats.adByProduct}
            from={searchParams.from || defaultFrom.toISOString().split("T")[0]}
            to={searchParams.to || defaultTo.toISOString().split("T")[0]}
            summary={orderSummary}
            totalCost={productTotals.totalCost}
            totalAdCost={expenseStats.totalAdCost}
            totalExpenses={expenseStats.totalExpenses}
            trueNetProfit={trueNetProfit}
          />
          <ProfitDatePicker
            defaultFrom={
              searchParams.from || defaultFrom.toISOString().split("T")[0]
            }
            defaultTo={searchParams.to || defaultTo.toISOString().split("T")[0]}
          />
        </div>
      </div>

      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي ما حُصِّل"
          value={formatCurrency(orderSummary.totalGrossRevenue)}
          sub={`من ${orderSummary.totalOrderCount} طلب مكتمل`}
          icon={DollarSign}
          neutral
        />
        <StatCard
          label="تكلفة التوصيل الفعلية"
          value={formatCurrency(orderSummary.totalActualShippingCost)}
          sub={`بغداد: ${formatCurrency(orderSummary.baghdadActualShippingCost)} | غيرها: ${formatCurrency(orderSummary.othersActualShippingCost)}`}
          icon={Truck}
          neutral
        />
        <StatCard
          label="تكلفة البضاعة"
          value={formatCurrency(productTotals.totalCost)}
          sub={`${productTotals.totalQty} قطعة مباعة`}
          icon={Package}
          neutral
        />
        <StatCard
          label="صافي الربح"
          value={formatCurrency(netProfit)}
          sub={`هامش الربح: ${overallMargin.toFixed(1)}%`}
          icon={netProfit >= 0 ? TrendingUp : TrendingDown}
          positive={netProfit >= 0}
        />
      </div>

      {/* KPI Cards — Row 1b: Expenses */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="مصاريف الإعلانات"
          value={formatCurrency(expenseStats.totalAdCost)}
          sub={`${expenseStats.adByProduct.length} منتج معلن`}
          icon={Megaphone}
          neutral
        />
        <StatCard
          label="المصاريف التشغيلية"
          value={formatCurrency(expenseStats.totalExpenses)}
          sub={`${expenseStats.expenseByCategory.length} تصنيف`}
          icon={Receipt}
          neutral
        />
        <StatCard
          label="إجمالي المصاريف"
          value={formatCurrency(expenseStats.totalOverheadCost)}
          sub="إعلانات + تشغيلية"
          icon={TrendingDown}
          positive={false}
        />
        <StatCard
          label="صافي الربح الحقيقي"
          value={formatCurrency(trueNetProfit)}
          sub={`هامش حقيقي: ${trueMargin.toFixed(1)}%`}
          icon={trueNetProfit >= 0 ? TrendingUp : TrendingDown}
          positive={trueNetProfit >= 0}
        />
      </div>

      {/* KPI Cards — Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
        {/* <StatCard
          label="صافي الإيراد (بعد التوصيل)"
          value={formatCurrency(productTotals.totalRevenue)}
          sub={`= ${formatCurrency(orderSummary.totalGrossRevenue)} - ${formatCurrency(orderSummary.totalActualShippingCost)}`}
          icon={DollarSign}
          neutral
        />
        <StatCard
          label="متوسط قيمة الطلب"
          value={formatCurrency(orderSummary.avgOrderValue)}
          sub="إجمالي ما دفعه الزبون"
          icon={ShoppingCart}
          neutral
        /> */}
        <StatCard
          label="طلبات بغداد"
          value={`${orderSummary.baghdadOrderCount} طلب`}
          sub={`تكلفة توصيل: ${formatCurrency(orderSummary.baghdadActualShippingCost)}`}
          icon={MapPin}
          neutral
        />
        <StatCard
          label="طلبات باقي المحافظات"
          value={`${orderSummary.othersOrderCount} طلب`}
          sub={`تكلفة توصيل: ${formatCurrency(orderSummary.othersActualShippingCost)}`}
          icon={MapPin}
          neutral
        />
      </div>

      {/* Product Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">تفصيل المنتجات</h2>
          <span className="text-xs text-muted-foreground">
            (الإيراد = ما حُصِّل − تكلفة التوصيل الفعلية، موزَّع نسبياً على
            المنتجات)
          </span>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">#</TableHead>
                <TableHead className="font-semibold">المنتج</TableHead>
                <TableHead className="text-right font-semibold">
                  الكمية
                </TableHead>
                <TableHead className="text-right font-semibold">
                  الإيراد الصافي
                </TableHead>
                <TableHead className="text-right font-semibold">
                  تكلفة البضاعة
                </TableHead>
                <TableHead className="text-right font-semibold">
                  صافي الربح
                </TableHead>
                <TableHead className="text-right font-semibold">
                  هامش الربح
                </TableHead>
                <TableHead className="text-right font-semibold">
                  مصاريف الإعلان
                </TableHead>
                <TableHead className="text-right font-semibold">
                  الربح بعد الإعلان
                </TableHead>
                <TableHead className="text-right font-semibold">
                  % من الإيراد
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productStats.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-12 text-muted-foreground"
                  >
                    {t("noData")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {productStats.map((item, index) => {
                    const margin =
                      item.totalRevenue > 0
                        ? (item.totalProfit / item.totalRevenue) * 100
                        : 0;
                    const adCost = adByProductMap.get(item.productId) ?? 0;
                    const profitAfterAd = item.totalProfit - adCost;
                    const revenueShare =
                      productTotals.totalRevenue > 0
                        ? (item.totalRevenue / productTotals.totalRevenue) * 100
                        : 0;
                    return (
                      <TableRow
                        key={item.productId}
                        className="hover:bg-muted/30"
                      >
                        <TableCell className="text-muted-foreground text-sm">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.totalQty}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(item.totalCost)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            item.totalProfit >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(item.totalProfit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <MarginBadge margin={margin} />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {adCost > 0 ? formatCurrency(adCost) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            adCost > 0
                              ? profitAfterAd >= 0
                                ? "text-green-600"
                                : "text-red-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {adCost > 0 ? formatCurrency(profitAfterAd) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{
                                  width: `${Math.min(revenueShare, 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-10 text-right">
                              {revenueShare.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/60 font-bold border-t-2">
                    <TableCell />
                    <TableCell>المجموع</TableCell>
                    <TableCell className="text-right">
                      {productTotals.totalQty}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(productTotals.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(productTotals.totalCost)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        netProfit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(netProfit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MarginBadge margin={overallMargin} />
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {expenseStats.totalAdCost > 0
                        ? formatCurrency(expenseStats.totalAdCost)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${
                        expenseStats.totalAdCost > 0
                          ? netProfit - expenseStats.totalAdCost >= 0
                            ? "text-green-600"
                            : "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {expenseStats.totalAdCost > 0
                        ? formatCurrency(netProfit - expenseStats.totalAdCost)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      100%
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delivery Cost Reference */}
      <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">
            تكاليف التوصيل الفعلية (للمرجع)
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              بغداد ({orderSummary.baghdadOrderCount} طلب)
            </p>
            <p className="font-bold">
              {formatCurrency(orderSummary.baghdadActualShippingCost)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              باقي المحافظات ({orderSummary.othersOrderCount} طلب)
            </p>
            <p className="font-bold">
              {formatCurrency(orderSummary.othersActualShippingCost)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">المجموع</p>
            <p className="font-bold">
              {formatCurrency(orderSummary.totalActualShippingCost)}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          هذه التكاليف مُدمجة في الإيراد الصافي للمنتجات ولا تُحتسب مرة أخرى
        </p>
      </div>

      {/* Expenses Breakdown */}
      {(expenseStats.expenseByCategory.length > 0 ||
        expenseStats.adByProduct.length > 0) && (
        <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">
                تفصيل المصاريف للفترة المحددة
              </h3>
            </div>
            <Link
              href="/admin/expenses"
              className="text-xs text-primary hover:underline"
            >
              إدارة المصاريف ←
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {expenseStats.expenseByCategory.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  مصاريف تشغيلية
                </p>
                {expenseStats.expenseByCategory.map((e) => (
                  <div
                    key={e.category}
                    className="flex justify-between items-center text-sm"
                  >
                    <span>
                      {e.category === "rent"
                        ? "إيجار"
                        : e.category === "salary"
                          ? "رواتب"
                          : e.category === "utilities"
                            ? "فواتير"
                            : e.category === "transport"
                              ? "نقل"
                              : "أخرى"}
                    </span>
                    <span className="font-medium text-red-600">
                      {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {expenseStats.adByProduct.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  مصاريف إعلانات
                </p>
                {expenseStats.adByProduct.map((a) => (
                  <div
                    key={a.productId}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="truncate max-w-[160px]">{a.name}</span>
                    <span className="font-medium text-red-600">
                      {formatCurrency(a.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Summary */}
      <div className="rounded-xl border bg-card p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              إجمالي ما حُصِّل
            </p>
            <p className="text-lg font-bold">
              {formatCurrency(orderSummary.totalGrossRevenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              تكلفة التوصيل + البضاعة + المصاريف
            </p>
            <p className="text-lg font-bold">
              {formatCurrency(
                orderSummary.totalActualShippingCost +
                  productTotals.totalCost +
                  expenseStats.totalOverheadCost,
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              صافي الربح الحقيقي
            </p>
            <p
              className={`text-lg font-bold ${trueNetProfit >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatCurrency(trueNetProfit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              هامش الربح الحقيقي
            </p>
            <p
              className={`text-lg font-bold ${trueMargin >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {trueMargin.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitPage;
