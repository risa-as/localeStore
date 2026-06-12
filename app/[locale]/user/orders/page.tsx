import { Metadata } from "next";
import { getMyOrders } from "@/lib/actions/order.actions";
import { getTranslations } from "next-intl/server";
import { formatCurrency, formatDateTime, formatId } from "@/lib/utils";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ShoppingBag, ChevronLeft, Clock, CheckCircle2, XCircle } from "lucide-react";
import Pagination from "@/components/shared/pagination";

export const metadata: Metadata = { title: "طلباتي" };

const OrdersPage = async (props: { searchParams: Promise<{ page: string }> }) => {
  const { page } = await props.searchParams;
  const session = await auth();
  if (!session) redirect("/sign-in");

  const t = await getTranslations("UserOrders");
  const orders = await getMyOrders({ page: Number(page) || 1 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <ShoppingBag className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-base text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      {orders.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
          <div className="w-24 h-24 rounded-3xl bg-muted flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold text-muted-foreground">لا يوجد طلبات بعد</p>
          <Link
            href="/"
            className="h-12 px-8 bg-primary text-white font-bold rounded-2xl inline-flex items-center gap-2 hover:bg-primary/90 transition-colors"
          >
            تسوق الآن <ChevronLeft className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <>
          {/* Cards */}
          <div className="space-y-3">
            {orders.data.map((order: any) => (
              <Link
                key={order.id}
                href={`/order/${order.id}`}
                className="block rounded-2xl border-2 bg-card p-4 sm:p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        طلب
                      </span>
                      <span className="text-sm font-mono font-bold text-primary">
                        #{formatId(order.id)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 shrink-0" />
                      {formatDateTime(order.createdAt).dateTime}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-extrabold text-primary">
                      {formatCurrency(order.totalPrice)}
                    </p>
                    <ChevronLeft className="w-5 h-5 text-muted-foreground ms-auto mt-1" />
                  </div>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl ${
                    order.isPaid
                      ? "bg-green-50 text-green-700 dark:bg-green-900/20"
                      : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20"
                  }`}>
                    {order.isPaid
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <XCircle className="w-3.5 h-3.5" />}
                    {order.isPaid ? t("paid") : t("notPaid")}
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl ${
                    order.isDelivered
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {order.isDelivered
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <Clock className="w-3.5 h-3.5" />}
                    {order.isDelivered ? t("delivered") : t("notDelivered")}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {orders.totalPages > 1 && (
            <Pagination page={Number(page) || 1} totalPages={orders.totalPages} urlParamName="page" />
          )}
        </>
      )}
    </div>
  );
};

export default OrdersPage;
