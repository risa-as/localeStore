import { Metadata } from "next";
import { auth } from "@/auth";
import { getOrderSummery } from "@/lib/actions/order.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeDollarSignIcon, Barcode, CreditCard, User } from "lucide-react";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  if (session?.user?.role !== "admin") {
    throw new Error("User is not authorized to access this page.");
  }
  const summary = await getOrderSummery();
  const t = await getTranslations('Admin');

  return (
    <div className="space-y-2">
      <h1 className="h2-bold">{t('dashboard')}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalRevenue')}</CardTitle>
            <BadgeDollarSignIcon />
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatCurrency(
              summary.totalSales._sum.totalPrice?.toString() || 0
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('profit')}</CardTitle>
            <BadgeDollarSignIcon />
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatCurrency(summary.totalProfit)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('sales')}</CardTitle>
            <CreditCard />
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatNumber(summary.ordersCount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customers')}</CardTitle>
            <User />
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatNumber(summary.usersCount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('products')}</CardTitle>
            <Barcode />
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatNumber(summary.productsCount)}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>{t('salesOverview')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Charts data={{ salesData: summary.salesData }} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t('recentSales')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('buyer')}</TableHead>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead className="text-end">{t('total')}</TableHead>
                  <TableHead className="w-[100px]">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.latestOrders.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell>{order?.fullName || t('deletedUser')}</TableCell>
                    <TableCell>
                      {formatDateTime(order?.createdAt).dateOnly}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(order?.totalPrice?.toString() || "0")}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orders/${order.id}`}>
                          {t('details')}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverviewPage;
