"use client";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "react";
import { addItemToCart, removeItemFromCart } from "@/lib/actions/cart.actions";
import { Cart } from "@/types";
import { ArrowLeft, Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useTranslations } from "next-intl";

const CartTable = ({ cart }: { cart?: Cart }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("Cart");

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center gap-5">
        <div className="w-24 h-24 rounded-3xl bg-muted flex items-center justify-center">
          <ShoppingCart className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold mb-2">{t("empty")}</h2>
          <p className="text-muted-foreground text-base">ابدأ بإضافة منتجات تعجبك</p>
        </div>
        <Button asChild size="lg" className="h-14 px-10 text-base font-bold rounded-2xl gap-2">
          <Link href="/">
            {t("goShopping")}
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="py-5 sm:py-8 space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <ShoppingCart className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold">{t("title")}</h1>
        <span className="text-sm bg-primary text-white font-bold px-2.5 py-1 rounded-full">
          {cart.items.reduce((a, c) => a + c.qty, 0)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {cart.items.map((item) => (
            <div
              key={item.slug}
              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border-2 bg-card hover:border-primary/20 transition-colors"
            >
              <Link href={`/product/${item.slug}`} className="shrink-0">
                <Image
                  src={item.image}
                  alt={item.name}
                  width={80}
                  height={80}
                  className="rounded-xl object-cover border w-16 h-16 sm:w-20 sm:h-20"
                />
              </Link>

              <div className="flex-1 min-w-0">
                <Link href={`/product/${item.slug}`}>
                  <p className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 hover:text-primary transition-colors">
                    {item.name}
                  </p>
                </Link>
                <p className="text-base sm:text-lg font-extrabold text-primary mt-1">
                  {formatCurrency(item.price)}
                </p>
              </div>

              {/* Qty + remove */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                  <Button
                    disabled={isPending}
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      startTransition(async () => {
                        const res = await removeItemFromCart(item.productId);
                        if (!res.success) toast({ variant: "destructive", description: res.message });
                      })
                    }
                  >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minus className="w-4 h-4" />}
                  </Button>
                  <span className="w-7 text-center text-base font-bold">{item.qty}</span>
                  <Button
                    disabled={isPending}
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary"
                    onClick={() =>
                      startTransition(async () => {
                        const res = await addItemToCart(item);
                        if (!res.success) toast({ variant: "destructive", description: res.message });
                      })
                    }
                  >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm font-bold text-muted-foreground">
                  = {formatCurrency(Number(item.price) * item.qty)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <div className="rounded-3xl border-2 bg-card p-5 sm:p-6 space-y-5 lg:sticky lg:top-20">
            <h2 className="text-xl font-extrabold">{t("cartSummary")}</h2>

            <div className="space-y-3 text-base">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("productCount")}</span>
                <span className="font-medium text-foreground">{cart.items.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("totalUnits")}</span>
                <span className="font-medium text-foreground">{cart.items.reduce((a, c) => a + c.qty, 0)}</span>
              </div>
              <div className="flex justify-between border-t-2 pt-3 font-extrabold text-lg">
                <span>{t("subtotal")}</span>
                <span className="text-primary text-xl">{formatCurrency(cart.itemsPrice)}</span>
              </div>
            </div>

            <Button
              className="w-full h-14 text-base font-extrabold gap-2 rounded-2xl shadow-lg shadow-primary/20"
              disabled={isPending}
              onClick={() => startTransition(() => router.push("/place-order"))}
            >
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowLeft className="w-5 h-5" />}
              {t("proceedToCheckout")}
            </Button>

            <Link href="/" className="block text-center text-base text-primary font-semibold hover:underline">
              {t("goShopping")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartTable;
