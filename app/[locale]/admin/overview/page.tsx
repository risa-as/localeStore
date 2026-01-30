import { Metadata } from "next";
import { auth } from "@/auth";
import { getOrderSummery } from "@/lib/actions/order.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Users, Package, CreditCard, Activity } from "lucide-react";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Charts from "./charts";
import { requireAdmin } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Admin Overview",
  description: "Admin overview page for ProStore",
};

const AdminOverviewPage = async () => {
  await requireAdmin();
  const session = await auth();
  /* if (session?.user?.role !== "admin") {
    throw new Error("User is not authorized to access this page.");
  } */
  const summary = await getOrderSummery();
  const t = await getTranslations('Admin');

  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('dashboard')}</h1>
        <div className="flex items-center gap-2">
          {/* Date Range Picker Could Go Here */}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/20 shadow-sm border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency((summary.totalSales as unknown as number) || 0)}</div>
            <p className={`text-xs ${summary.statsChange?.revenue! < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {summary.statsChange?.revenue! > 0 ? '+' : ''}{summary.statsChange?.revenue}% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-900/20 shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('sales')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.ordersCount)}</div>
            <p className={`text-xs ${summary.statsChange?.orders! < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {summary.statsChange?.orders! > 0 ? '+' : ''}{summary.statsChange?.orders}% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-transparent dark:from-purple-900/20 shadow-sm border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('customers')}</CardTitle>
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.usersCount)}</div>
            <p className={`text-xs ${summary.statsChange?.users! < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {summary.statsChange?.users! > 0 ? '+' : ''}{summary.statsChange?.users}% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-transparent dark:from-orange-900/20 shadow-sm border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('products')}</CardTitle>
            <Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.productsCount)}</div>
            <p className={`text-xs ${summary.statsChange?.products! < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {summary.statsChange?.products! > 0 ? '+' : ''}{summary.statsChange?.products}% from last month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Sales Chart */}
        <Card className="col-span-4 shadow-md">
          <CardHeader>
            <CardTitle>{t('salesOverview')}</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <Charts data={{ salesData: summary.salesData }} />
          </CardContent>
        </Card>

        {/* Recent Sales List (Replaces Table) */}
        <Card className="col-span-3 shadow-md">
          <CardHeader>
            <CardTitle>{t('recentSales')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {summary.latestOrders.map((order: any) => (
                <div key={order.id} className="flex items-center">
                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary font-medium">
                    {order.fullName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{order.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.email || order.phoneNumber}
                    </p>
                  </div>
                  <div className="ml-auto font-medium">
                    {formatCurrency(order.totalPrice?.toString() || "0")}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <Button asChild variant="outline" className="w-full">
                <Link href="/admin/orders">
                  {t('viewAllOrders')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverviewPage;
