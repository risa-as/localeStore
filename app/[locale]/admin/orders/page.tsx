import { auth } from "@/auth";
import Pagination from "@/components/shared/pagination";
import { deleteOrder, getAllOrders } from "@/lib/actions/order.actions";
import { requireAdmin } from "@/lib/auth-guard";
import { Metadata } from "next";
import { formatCurrency, formatDateTime, formatId } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import OrdersTable from "./orders-table";

export const metadata: Metadata = {
  title: "Admin Orders",
};
const AdminOrdersPage = async (props: {
  searchParams: Promise<{ page: string; query: string; status: string }>;
}) => {
  await requireAdmin();
  const { page = "1", query: searchText = "", status = 'home' } = await props.searchParams;
  const session = await auth();
  if (session?.user?.role !== "admin")
    throw new Error("User Is Not Authorized");
  const orders = await getAllOrders({
    page: Number(page),
    limit: 5,
    query: searchText,
    status,
  });

  const t = await getTranslations('Admin');

  const statuses = ['home', 'account', 'pending', 'completed', 'returned', 'waiting'];

  return (
    <div className="space-y-4">
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

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
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
// Force rebuild
