import Pagination from "@/components/shared/pagination";
import {
  getAllOrders,
  getOrdersSummaryStats,
} from "@/lib/actions/order.actions";
import { formatCurrency } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth-guard";
import { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import OrdersTable from "./orders-table";
import AdminSearch from "@/components/admin/admin-search";
import OrdersExportButton from "@/components/admin/orders-export-button";
import OrdersImportButton from "@/components/admin/orders-import-button";
import BulkUpdateByDateDialog from "@/components/admin/bulk-update-by-date-dialog";
import ModonSyncButton from "@/components/admin/modon-sync-button";
import { PAGE_SIZE } from "@/lib/constants";
import {
  X,
  BarChart2,
  ShoppingBag,
  Wallet,
  Truck,
  Package,
} from "lucide-react";

// n8n
import { prisma } from "@/db/prisma";
//
export const metadata: Metadata = {
  title: "الطلبات",
};

const STATUS_COLORS: Record<string, string> = {
  home: "data-[active=true]:bg-slate-700   data-[active=true]:text-white",
  account: "data-[active=true]:bg-blue-600    data-[active=true]:text-white",
  pending: "data-[active=true]:bg-yellow-500  data-[active=true]:text-white",
  completed: "data-[active=true]:bg-green-600   data-[active=true]:text-white",
  returned: "data-[active=true]:bg-red-500     data-[active=true]:text-white",
  returnReceived:
    "data-[active=true]:bg-teal-600    data-[active=true]:text-white",
  rescheduled:
    "data-[active=true]:bg-indigo-600  data-[active=true]:text-white",
  failed: "data-[active=true]:bg-red-700     data-[active=true]:text-white",
  completedAccountant:
    "data-[active=true]:bg-emerald-700 data-[active=true]:text-white",
  waiting: "data-[active=true]:bg-orange-500  data-[active=true]:text-white",
  unavailable:
    "data-[active=true]:bg-gray-500    data-[active=true]:text-white",
  banned: "data-[active=true]:bg-black       data-[active=true]:text-white",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  note,
  noteTone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  note?: string;
  noteTone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className="p-1.5 rounded-lg bg-muted shrink-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      <p className="text-xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
      {note && (
        <p
          className={`text-[11px] font-semibold ${
            noteTone === "bad" ? "text-red-600" : "text-green-600"
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

const AdminOrdersPage = async (props: {
  searchParams: Promise<{
    page: string;
    query: string;
    status: string;
    sort: string;
  }>;
}) => {
  await requireAdmin();
  const {
    page = "1",
    query: searchText = "",
    status = "home",
    sort = "date",
  } = await props.searchParams;
  // n8n
  const failedWhatsapp = await prisma.whatsAppFailedDelivery.findMany({
    select: { phone: true },
  });
  const failedPhone = new Set(failedWhatsapp.map((t) => t.phone));
  //
  const [orders, stats] = await Promise.all([
    getAllOrders({
      page: Number(page),
      limit: PAGE_SIZE,
      query: searchText,
      status,
      sort,
    }),
    // Scoped to the same status tab + search as the table below.
    getOrdersSummaryStats({ query: searchText, status }),
  ]);

  const t = await getTranslations("Admin");

  const scopeLabel =
    status && status !== "all" ? t(`Orders.Status.${status}`) : "جميع الحالات";

  // موجب = ربحت من التوصيل، سالب = دفعت لشركة التوصيل أكثر مما حصّلت.
  const shippingMargin = stats.chargedShipping - stats.actualShippingCost;

  const statuses = [
    "home",
    "account",
    "pending",
    "completed",
    "returned",
    "rescheduled",
    "failed",
    "returnReceived",
    "completedAccountant",
    "waiting",
    "unavailable",
    "delete",
    "banned",
  ];

  return (
    <div className="space-y-4">
      {/* ── Row 1: Title + Modon Sync ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-2xl font-bold shrink-0">{t("orders")}</h1>
          {searchText && (
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full text-xs font-medium">
              <span className="truncate max-w-[120px]">
                &quot;{searchText}&quot;
              </span>
              <Link
                href={`/admin/orders?status=${status}`}
                className="shrink-0 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/modon-stats"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            <span className="hidden sm:inline">إحصائيات</span>
          </Link>
          <ModonSyncButton />
        </div>
      </div>

      {/* ── Row 2: Search + Secondary Actions ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <AdminSearch />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <BulkUpdateByDateDialog />
          <OrdersImportButton />
          <OrdersExportButton
            query={searchText}
            status={status}
            sort={sort}
          />
        </div>
      </div>

      {/* ── Row 3: Status Tabs ── */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
        {statuses.map((s) => {
          const isActive = status === s;
          const colorClass =
            STATUS_COLORS[s] ??
            "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";
          return (
            <Link
              key={s}
              href={`/admin/orders?status=${s}`}
              className="shrink-0"
            >
              <button
                data-active={isActive}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap
                  ${colorClass}
                  ${
                    isActive
                      ? "shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground bg-transparent border border-border"
                  }
                `}
              >
                {t(`Orders.Status.${s}`)}
              </button>
            </Link>
          );
        })}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="إجمالي الطلبات"
          value={String(stats.orderCount)}
          sub={scopeLabel}
          icon={ShoppingBag}
        />
        <StatCard
          label="قيمة الطلبات"
          value={formatCurrency(stats.totalValue)}
          sub="مجموع أسعار الطلبات"
          icon={Wallet}
        />
        {/* البطاقتان التاليتان تستخدمان رقمَي توصيل مختلفين عمداً: المدفوع
            لشركة التوصيل مقابل المُحصَّل من الزبون. نعرضهما معاً حتى لا تبدو
            عملية الطرح خاطئة، ولأن الفرق بينهما هو ربح/خسارة التوصيل. */}
        <StatCard
          label="تكلفة التوصيل"
          value={formatCurrency(stats.actualShippingCost)}
          sub={`فعلي · مُحصَّل من الزبون: ${formatCurrency(stats.chargedShipping)}`}
          icon={Truck}
          note={
            shippingMargin === 0
              ? undefined
              : shippingMargin > 0
                ? `ربح توصيل: ${formatCurrency(shippingMargin)}`
                : `خسارة توصيل: ${formatCurrency(Math.abs(shippingMargin))}`
          }
          noteTone={shippingMargin >= 0 ? "good" : "bad"}
        />
        <StatCard
          label="قيمة الطلبات بدون توصيل"
          value={formatCurrency(stats.valueWithoutShipping)}
          sub={`قيمة المنتجات فقط = القيمة − التوصيل المُحصَّل (${formatCurrency(stats.chargedShipping)})`}
          icon={Package}
        />
      </div>

      {/* ── Orders Table ── */}
      <OrdersTable
        orders={orders.data}
        page={Number(page) || 1}
        count={orders.totalPages}
        sort={sort}
        status={status}
        failedPhone={Array.from(failedPhone)}
      />

      {orders.totalPages > 1 && (
        <Pagination
          page={Number(page) || 1}
          totalPages={orders.totalPages}
          urlParamName="page"
        />
      )}
    </div>
  );
};

export default AdminOrdersPage;
