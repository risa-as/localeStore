"use client";
import { Cart, CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Plus, Minus, Loader, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { addItemToCart, removeItemFromCart } from "@/lib/actions/cart.actions";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

const AddToCart = ({ cart, item }: { cart?: Cart; item: CartItem }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("Product");

  const handleAddToCart = async () => {
    startTransition(async () => {
      const res = await addItemToCart(item);
      if (!res.success) {
        toast({ variant: "destructive", description: res.message });
        return;
      }
      toast({
        description: res.message,
        action: (
          <ToastAction
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            altText="Go Cart"
            onClick={() => router.push("/cart")}
          >
            {t("goToCart")}
          </ToastAction>
        ),
      });
    });
  };

  const handleRemoveFromCart = async () => {
    startTransition(async () => {
      const res = await removeItemFromCart(item.productId);
      toast({
        variant: res.success ? "default" : "destructive",
        description: res.message,
      });
    });
  };

  const existItem = cart && cart.items.find((x) => x.productId === item.productId);

  if (existItem) {
    return (
      <div className="flex items-center gap-0 rounded-2xl border-2 border-primary/20 overflow-hidden w-fit">
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={handleRemoveFromCart}
          className="h-12 w-12 rounded-none hover:bg-primary/10 transition-colors"
        >
          {isPending ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
        </Button>
        <span className="w-12 text-center text-lg font-extrabold tabular-nums select-none">
          {existItem.qty}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={handleAddToCart}
          className="h-12 w-12 rounded-none hover:bg-primary/10 transition-colors"
        >
          {isPending ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <Button
      className="w-full h-13 rounded-2xl text-base font-bold gap-2.5 shadow-sm"
      disabled={isPending}
      onClick={handleAddToCart}
    >
      {isPending ? (
        <Loader className="h-5 w-5 animate-spin" />
      ) : (
        <ShoppingCart className="h-5 w-5" />
      )}
      {t("addToCart")}
    </Button>
  );
};

export default AddToCart;
