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
import { PAGE_SIZE } from "@/lib/constants";
import { NextIntlClientProvider } from "next-intl";

export const metadata: Metadata = {
  title: "Admin Orders",
};

const AdminOrdersPage = async (props: {
  searchParams: Promise<{ page: string; query: string; status: string }>;
}) => {
  await requireAdmin();
  const { page = "1", query: searchText = "", status = 'home' } = await props.searchParams;

  const orders = await getAllOrders({
    page: Number(page),
    limit: PAGE_SIZE,
    query: searchText,
    status,
  });

  const t = await getTranslations('Admin');
  const messages = await getMessages();
  const locale = await getLocale();

  const statuses = ['home', 'account', 'pending', 'completed', 'returned', 'waiting', 'banned'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h1 className="h2-bold">{t('orders')}</h1>

          {searchText && (
            <div>
              {t('filteredBy')} <i>&quot;{searchText}&quot;</i>{" "}
              <Link href={`/admin/orders?status=${status}`}>
                <Button variant={"outline"} size="sm">
                  {t('removeFilter')}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <Link key={s} href={`/admin/orders?status=${s}`}>
              <Button
                variant={status === s ? "default" : "outline"}
                size="sm"
                className={status === s ? "bg-primary text-primary-foreground" : ""}
              >
                {t(`Orders.Status.${s}`)}
              </Button>
            </Link>
          ))}
          {/* TODO: Add search */}
          {/* <NextIntlClientProvider locale={locale} messages={messages}>
            <AdminSearch />
          </NextIntlClientProvider> */}

        </div>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <OrdersExportButton query={searchText} status={status} />
        </NextIntlClientProvider>
      </div>

      <OrdersTable
        orders={orders.data}
        page={Number(page) || 1}
        count={orders.totalPages}
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
