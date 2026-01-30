"use client";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "react";
import { addItemToCart, removeItemFromCart } from "@/lib/actions/cart.actions";
import { Cart } from "@/types";
import { ArrowRight, Loader, Minus, Plus } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";

const CartTable = ({ cart }: { cart?: Cart }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('Cart');

  return (
    <>
      <h1 className="py-4 h2-bold">{t('title')}</h1>
      {!cart || cart.items.length === 0 ? (
        <div>
          {t('empty')} <Link href="/">{t('goShopping')}</Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-4 md:gap-5">
          <div className="overflow-x-auto md:col-span-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('item')}</TableHead>
                  <TableHead className="text-center">{t('quantity')}</TableHead>
                  <TableHead className="text-right">{t('price')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.items.map((item) => (
                  <TableRow key={item.slug}>
                    <TableCell>
                      <Link
                        href={`/product/${item.slug}`}
                        className="flex items-center"
                      >
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={50}
                          height={50}
                        />
                        <span className="px-2">{item.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="flex-center gap-2">
                      <Button
                        disabled={isPending}
                        variant="outline"
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await removeItemFromCart(
                              item.productId
                            );
                            if (!res.success) {
                              toast({
                                variant: "destructive",
                                description: res.message,
                              });
                            }
                          })
                        }
                      >
                        {isPending ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                      </Button>
                      <span>{item.qty}</span>
                      <Button
                        disabled={isPending}
                        variant="outline"
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await addItemToCart(item);
                            if (!res.success) {
                              toast({
                                variant: "destructive",
                                description: res.message,
                              });
                            }
                          })
                        }
                      >
                        {isPending ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="relative h-fit">
            <Card className="border-none shadow-lg bg-gradient-to-b from-muted/20 to-muted/50 overflow-hidden">
              <CardContent className="p-6 space-y-6">
                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                  {t('cartSummary')}
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>{t("productCount")}</span>
                    <span>{cart.items.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-muted-foreground border-b pb-2">
                    <span>{t("totalUnits")}</span>
                    <span>{cart.items.reduce((a, c) => a + c.qty, 0)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold">{t("subtotal")}</span>
                    <span className="text-2xl font-bold font-mono tracking-tight text-primary">
                      {formatCurrency(cart.itemsPrice)}
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full text-lg py-6 font-semibold shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => router.push("/place-order"))
                  }
                >
                  {isPending ? (
                    <Loader className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-5 h-5 mr-2" />
                  )}
                  {t('proceedToCheckout')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
};

export default CartTable;
