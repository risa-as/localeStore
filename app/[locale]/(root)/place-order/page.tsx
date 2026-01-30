import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMyCart } from "@/lib/actions/cart.actions";
import { getUserById } from "@/lib/actions/user.actions";
import { formatCurrency } from "@/lib/utils";
import { ShippingAddress } from "@/types";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlaceOrderForm from "./place-order-form";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Place Order",
};

const PlaceOrderPage = async () => {
  const cart = await getMyCart();

  const cookieStore = await cookies();
  const guestShippingInfo = cookieStore.get("guest-shipping-info")?.value;

  let defaultValues: {
    fullName: string;
    phoneNumber: string;
    governorate: string;
    address: string;
    quantity: number;
  } = {
    fullName: "",
    phoneNumber: "",
    governorate: "",
    address: "",
    quantity: 0
  };
  let isEditable = true;

  let userAddress: ShippingAddress | null = null; // Keep for display purposes
  let paymentMethod = "Cash On Delivery"; // Default for guest

  if (guestShippingInfo) {
    const guestData = JSON.parse(guestShippingInfo);
    // Assuming guestData matches insertOrderSchema structure from createQuickOrder
    defaultValues = {
      fullName: guestData.fullName || "",
      phoneNumber: guestData.phoneNumber || "",
      governorate: guestData.city || guestData.governorate || "",
      address: guestData.streetAddress || guestData.address || "",
      quantity: 0
    };
    isEditable = false;

    // Adapt guestData to ShippingAddress for display in existing JSX
    userAddress = {
      fullName: guestData.fullName,
      streetAddress: guestData.address,
      city: guestData.governorate,
      postalCode: "",
      country: "",
    };
  }


  if (!cart || cart.items.length === 0) redirect("/cart");
  // We no longer redirect if userAddress is missing, as we will collect it in the form if needed.

  const t = await getTranslations('Checkout');

  return (
    <>
      <h1 className="py-4 text-2xl">{t('placeOrder')}</h1>
      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2 overflow-x-auto space-y-4">
          <Card>
            <CardContent className="p-6 gap-4">
              <h2 className="text-xl font-bold pb-4">{t('orderItems')}</h2>
              <div className="space-y-4">
                {cart.items.map((item) => (
                  <div key={item.slug} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <div className="relative w-16 h-16 rounded-md overflow-hidden border">
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{t('items')}: {item.qty}</p>
                      </div>
                    </div>
                    <div className="font-bold">
                      {formatCurrency(Number(item.price) * item.qty)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardContent className="p-4 gap-4 space-y-4">
              <div className="flex justify-between">
                <div>{t('items')}</div>
                <div>{formatCurrency(cart.itemsPrice)}</div>
              </div>

              <div className="flex justify-between">
                <div>{t('shipping')}</div>
                <div>{formatCurrency(cart.shippingPrice)}</div>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-4">
                <div>{t('total')}</div>
                <div>{formatCurrency(cart.totalPrice)}</div>
              </div>
              {/* Form handles inputs (if isEditable) or just hidden fields/submit (if !isEditable) */}
              <PlaceOrderForm cart={cart} defaultValues={defaultValues} isEditable={isEditable} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default PlaceOrderPage;
