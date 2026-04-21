import { auth } from "@/auth";
import Pagination from "@/components/shared/pagination";
import { deleteOrder, getAllOrders } from "@/lib/actions/order.actions";
import { requireAdmin } from "@/lib/auth-guard";
import { Metadata } from "next";
import { formatCurrency, formatDateTime, formatId } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getTranslations, getMessages, getLocale } from "next-intl/server";
import OrdersTable from "./orders-table";
import AdminSearch from "@/components/admin/admin-search";
import OrdersExportButton from "@/components/admin/orders-export-button";
import OrdersImportButton from "@/components/admin/orders-import-button";
import BulkUpdateByDateDialog from "@/components/admin/bulk-update-by-date-dialog";
import ModonSyncButton from "@/components/admin/modon-sync-button";
import { PAGE_SIZE } from "@/lib/constants";
import { NextIntlClientProvider } from "next-intl";
import { X } from "lucide-react";

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

  const orders = await getAllOrders({
    page: Number(page),
    limit: PAGE_SIZE,
    query: searchText,
    status,
    sort,
  });

  const t = await getTranslations("Admin");
  const messages = await getMessages();
  const locale = await getLocale();

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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ModonSyncButton />
        </NextIntlClientProvider>
      </div>

      {/* ── Row 2: Search + Secondary Actions ── */}
      <NextIntlClientProvider locale={locale} messages={messages}>
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
      </NextIntlClientProvider>

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

      {/* ── Orders Table ── */}
      <NextIntlClientProvider locale={locale} messages={messages}>
        <OrdersTable
          orders={orders.data}
          page={Number(page) || 1}
          count={orders.totalPages}
          sort={sort}
          status={status}
        />
      </NextIntlClientProvider>

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
