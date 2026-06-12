"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime, formatId } from "@/lib/utils";
import { Order } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "react";
import { deliverOrder } from "@/lib/actions/order.actions";
import { useTranslations } from "next-intl";
import {
  MapPin, User, Phone, Clock, PackageCheck,
  CheckCircle2, Loader2, ShoppingBag,
} from "lucide-react";

const OrderDetailsTable = ({
  order,
  isAdmin,
}: {
  order: Order;
  isAdmin: boolean;
}) => {
  const { id, orderitems, fullName, phoneNumber, governorate, address, status, createdAt, quantity } =
    order as any;

  const t = useTranslations("Checkout");

  const itemsPrice = orderitems.reduce(
    (acc: number, item: any) => acc + Number(item.price) * item.qty,
    0
  );

  const MarkAsDeliveredButton = () => {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    return (
      <Button
        type="button"
        disabled={isPending}
        className="w-full h-12 text-base font-bold rounded-2xl gap-2"
        onClick={() =>
          startTransition(async () => {
            const res = await deliverOrder(order.id);
            toast({ variant: res.success ? "default" : "destructive", description: res.message });
          })
        }
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {isPending ? "جاري التحديث..." : "تأكيد التسليم"}
      </Button>
    );
  };

  const statusColors: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const statusColor = statusColors[status?.toLowerCase()] || "bg-muted text-muted-foreground";

  return (
    <div className="py-5 sm:py-8 space-y-5 sm:space-y-6">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <ShoppingBag className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">طلب #{formatId(id)}</h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(createdAt).dateTime}</p>
        </div>
        <span className={`ms-auto text-sm font-bold px-3 py-1.5 rounded-xl ${statusColor}`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-4">

          {/* Customer */}
          <Card className="rounded-3xl border-2">
            <CardContent className="p-5 space-y-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> بيانات العميل
              </h2>
              <div className="space-y-2.5 text-base">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{fullName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span dir="ltr" className="font-medium">{phoneNumber}</span>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="font-medium">{governorate}{address ? `، ${address}` : ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{formatDateTime(createdAt).dateTime}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="rounded-3xl border-2">
            <CardContent className="p-5">
              <h2 className="text-lg font-extrabold flex items-center gap-2 mb-4">
                <PackageCheck className="w-5 h-5 text-primary" /> المنتجات
              </h2>
              <div className="space-y-3">
                {orderitems.map((item: any) => (
                  <div key={item.slug} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                    <Link href={`/product/${item.slug}`} className="shrink-0">
                      <Image
                        src={item.image}
                        alt={item.name}
                        width={64}
                        height={64}
                        className="rounded-xl border w-14 h-14 sm:w-16 sm:h-16 object-cover"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/product/${item.slug}`}>
                        <p className="text-sm sm:text-base font-semibold line-clamp-2 hover:text-primary">
                          {item.name}
                        </p>
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {item.qty} × {formatCurrency(item.price)}
                      </p>
                    </div>
                    <p className="font-extrabold text-base text-primary shrink-0">
                      {formatCurrency(Number(item.price) * item.qty)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div>
          <Card className="rounded-3xl border-2 shadow-lg lg:sticky lg:top-20">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-extrabold">ملخص الطلب</h2>
              <div className="space-y-2.5 text-base">
                <div className="flex justify-between text-muted-foreground">
                  <span>عدد القطع</span>
                  <span className="font-semibold text-foreground">{quantity}</span>
                </div>
                <div className="flex justify-between border-t-2 pt-3 font-extrabold text-lg">
                  <span>الإجمالي</span>
                  <span className="text-primary text-xl">{formatCurrency(itemsPrice)}</span>
                </div>
              </div>
              {isAdmin && status !== "completed" && (
                <div className="pt-2">
                  <MarkAsDeliveredButton />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsTable;
