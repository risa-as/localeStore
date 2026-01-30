import { Metadata } from "next";
import { getMyOrders } from "@/lib/actions/order.actions";
import { getTranslations } from "next-intl/server";
import { formatCurrency, formatDateTime, formatId } from "@/lib/utils";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/shared/pagination";
export const metadata: Metadata = {
  title: "My Orders",
  description: "View and manage your orders",
};
const OrdersPage = async (props: {
  searchParams: Promise<{ page: string }>;
}) => {
  const { page } = await props.searchParams;
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }
  const t = await getTranslations("UserOrders");
  const orders = await getMyOrders({
    page: Number(page) || 1,
  });
  return (
    <div className="space-y-2">
      <h2 className="h2-bold">{t("title")}</h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("id")}</TableHead>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("total")}</TableHead>
              <TableHead>{t("paid")}</TableHead>
              <TableHead>{t("delivered")}</TableHead>
              <TableHead>{t("action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.data.map((order: any) => (
              <TableRow key={order.id}>
                <TableCell>{formatId(order.id)}</TableCell>
                <TableCell>
                  {formatDateTime(order.createdAt).dateTime}
                </TableCell>
                <TableCell>{formatCurrency(order.totalPrice)}</TableCell>
                <TableCell>
                  {order.isPaid && order.paidAt
                    ? formatDateTime(order.paidAt).dateTime
                    : t("notPaid")}
                </TableCell>
                <TableCell>
                  {order.isDelivered && order.deliveredAt
                    ? formatDateTime(order.deliveredAt).dateTime
                    : t("notDelivered")}
                </TableCell>
                <TableCell>
                  <Link href={`/order/${order.id}`}>
                    <span className="px-2">{t("details")}</span>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {orders.totalPages > 1 && (
          <Pagination
            page={Number(page) || 1}
            totalPages={orders.totalPages}
            urlParamName="page"
          />
        )}
      </div>
    </div>
  );
};

export default OrdersPage;
