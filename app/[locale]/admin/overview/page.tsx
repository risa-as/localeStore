import { Metadata } from "next";
import { auth } from "@/auth";
import { getOrderSummery } from "@/lib/actions/order.actions";
import { formatCurrency, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Charts from "./charts";
import { requireAdmin } from "@/lib/auth-guard";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  TrendingUp, TrendingDown,
  ShoppingCart, Users, Package,
  ArrowRight, Banknote, CircleDollarSign,
} from "lucide-react";

export const metadata: Metadata = {
  title: "لوحة التحكم",
};

const StatCard = ({
  title,
  value,
  change,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) => {
  const isPositive = change >= 0;
  return (
    <div className="rounded-2xl border bg-card p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
            isPositive
              ? "bg-green-50 text-green-600 dark:bg-green-900/20"
              : "bg-red-50 text-red-600 dark:bg-red-900/20"
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {isPositive ? "+" : ""}{change}%
        </span>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-extrabold tracking-tight">{value}</p>
      </div>
    </div>
  );
};

const AdminOverviewPage = async () => {
  await requireAdmin();
  const session = await auth();

  if (session?.user?.role === "employee") {
    redirect("/admin/orders");
  }

  const summary = await getOrderSummery();
  const t = await getTranslations("Admin");

  const statCards = [
    {
      title: t("totalRevenue"),
      value: formatCurrency((summary.totalSales as unknown as number) || 0),
      change: summary.statsChange.revenue,
      icon: CircleDollarSign,
      iconBg: "bg-green-50 dark:bg-green-900/20",
      iconColor: "text-green-600 dark:text-green-400",
    },
    {
      title: t("sales"),
      value: formatNumber(summary.ordersCount),
      change: summary.statsChange.orders,
      icon: ShoppingCart,
      iconBg: "bg-blue-50 dark:bg-blue-900/20",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: t("customers"),
      value: formatNumber(summary.usersCount),
      change: summary.statsChange.users,
      icon: Users,
      iconBg: "bg-purple-50 dark:bg-purple-900/20",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      title: t("products"),
      value: formatNumber(summary.productsCount),
      change: summary.statsChange.products,
      icon: Package,
      iconBg: "bg-orange-50 dark:bg-orange-900/20",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("dashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("ar-IQ", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      {/* Profit card */}
      <div className="rounded-2xl border bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40">
            <Banknote className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">صافي الربح (الشهر الحالي)</p>
            <p className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-300 tracking-tight">
              {formatCurrency(summary.totalProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* Chart + Recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {/* Chart */}
        <div className="lg:col-span-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold">{t("salesOverview")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">إجمالي المبيعات</p>
          </div>
          <Charts
            data={{
              salesData: summary.salesData,
              dailySalesData: summary.dailySalesData,
            }}
          />
        </div>

        {/* Recent orders */}
        <div className="lg:col-span-3 rounded-2xl border bg-card p-5 shadow-sm flex flex-col">
          <div className="mb-4">
            <h2 className="text-base font-bold">{t("recentSales")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">آخر 6 طلبات</p>
          </div>

          <div className="flex-1 space-y-3">
            {summary.latestOrders.map((order: any) => (
              <div
                key={order.id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                  {order.fullName?.substring(0, 2).toUpperCase() ?? "??"}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{order.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {order.phoneNumber || order.email}
                  </p>
                </div>
                {/* Amount */}
                <span className="text-sm font-bold shrink-0 text-green-600 dark:text-green-400">
                  {formatCurrency(order.totalPrice?.toString() || "0")}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <Button asChild variant="outline" className="w-full rounded-xl gap-2">
              <Link href="/admin/orders">
                {t("viewAllOrders")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOverviewPage;
