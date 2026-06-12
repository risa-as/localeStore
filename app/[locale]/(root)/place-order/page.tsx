import { Card, CardContent } from "@/components/ui/card";
import { getMyCart } from "@/lib/actions/cart.actions";
import { formatCurrency } from "@/lib/utils";
import { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import PlaceOrderForm from "./place-order-form";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { ShippingAddress } from "@/types";
import { ShoppingBag, MapPin } from "lucide-react";

export const metadata: Metadata = { title: "إتمام الطلب" };

const PlaceOrderPage = async () => {
  const cart = await getMyCart();
  const cookieStore = await cookies();
  const guestShippingInfo = cookieStore.get("guest-shipping-info")?.value;

  let defaultValues = { fullName: "", phoneNumber: "", governorate: "", address: "", quantity: 0 };
  let isEditable = true;
  let userAddress: ShippingAddress | null = null;

  if (guestShippingInfo) {
    const g = JSON.parse(guestShippingInfo);
    defaultValues = {
      fullName: g.fullName || "",
      phoneNumber: g.phoneNumber || "",
      governorate: g.city || g.governorate || "",
      address: g.streetAddress || g.address || "",
      quantity: 0,
    };
    isEditable = false;
    userAddress = { fullName: g.fullName, streetAddress: g.address, city: g.governorate, postalCode: "", country: "" };
  }

  if (!cart || cart.items.length === 0) redirect("/cart");

  const t = await getTranslations("Checkout");

  return (
    <div className="py-5 sm:py-8 space-y-5 sm:space-y-8">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <ShoppingBag className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold">{t("placeOrder")}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Items */}
        <div className="lg:col-span-2">
          <Card className="rounded-3xl border-2">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-extrabold">{t("orderItems")}</h2>
              </div>
              <div className="space-y-4">
                {cart.items.map((item) => (
                  <div key={item.slug} className="flex items-center gap-3 sm:gap-4 py-3 border-b last:border-0">
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 shrink-0">
                      <Image src={item.image} alt={item.name} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm sm:text-base line-clamp-2">{item.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {item.qty} × {formatCurrency(item.price)}
                      </p>
                    </div>
                    <p className="font-extrabold text-base sm:text-lg text-primary shrink-0">
                      {formatCurrency(Number(item.price) * item.qty)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary + Form */}
        <div>
          <Card className="rounded-3xl border-2 shadow-lg shadow-primary/5 lg:sticky lg:top-20">
            <CardContent className="p-5 space-y-5">
              {/* Price summary */}
              <div>
                <h2 className="text-xl font-extrabold mb-4">ملخص الطلب</h2>
                <div className="space-y-2.5 text-base">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("items")}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(cart.itemsPrice)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("shipping")}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(cart.shippingPrice)}</span>
                  </div>
                  <div className="flex justify-between border-t-2 pt-3 font-extrabold text-lg">
                    <span>{t("total")}</span>
                    <span className="text-primary text-xl">{formatCurrency(cart.totalPrice)}</span>
                  </div>
                </div>
              </div>

              {/* Shipping form */}
              <div className="border-t-2 pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold">{t("shippingAddress")}</h3>
                </div>
                <PlaceOrderForm cart={cart} defaultValues={defaultValues} isEditable={isEditable} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PlaceOrderPage;
