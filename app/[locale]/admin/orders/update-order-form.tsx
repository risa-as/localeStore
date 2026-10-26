"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { updateOrder } from "@/lib/actions/order.actions";
import { updateOrderSchema } from "@/lib/validators";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";
import { computeOrderPricing } from "@/lib/pricing";

type Order = z.infer<typeof updateOrderSchema>;

export default function UpdateOrderForm({
    order,
    setOpen,
}: {
    order: any;
    setOpen: (open: boolean) => void;
}) {
    const t = useTranslations("Admin");
    const tCheckout = useTranslations("Checkout");
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Per-item qty state — keyed by productId (OrderItem has no standalone id)
    const [itemQtys, setItemQtys] = useState<Record<string, number>>(
        Object.fromEntries(
            (order.orderitems ?? []).map((item: any) => [item.productId, item.qty ?? 1])
        )
    );
    // المنتجات التي أزالها المشرف — لا تُحذف فعلياً إلا عند الحفظ
    const [removedIds, setRemovedIds] = useState<string[]>([]);
    const [isPriceManual, setIsPriceManual] = useState(false);

    const visibleItems = ((order.orderitems ?? []) as any[]).filter(
        (item: any) => !removedIds.includes(item.productId)
    );

    // مصدر واحد للسعر والكمية معاً، حتى لا يبقى أحدهما يحسب منتجاً محذوفاً
    const deriveTotals = (qtys: Record<string, number>, removed: string[]) => {
        const items = ((order.orderitems ?? []) as any[]).filter(
            (item: any) => !removed.includes(item.productId)
        );
        if (!items.length) return { total: Number(order.totalPrice), qty: 0 };
        return items.reduce(
            (acc: { total: number; qty: number }, item: any) => {
                const qty = qtys[item.productId] ?? item.qty ?? 1;
                return {
                    total: acc.total + computeOrderPricing({ quantity: qty, unitPrice: Number(item.price), shippingPrice: 0, offers: item.offersSnapshot }).itemsPrice,
                    qty: acc.qty + qty,
                };
            },
            { total: Number(form.getValues("shippingPrice") || 0), qty: 0 }
        );
    };

    const form = useForm<Order>({
        resolver: zodResolver(updateOrderSchema) as any,
        defaultValues: {
            id: order.id,
            fullName: order.fullName,
            phoneNumber: order.phoneNumber,
            governorate: order.governorate,
            address: order.address,
            quantity: order.quantity,
            totalPrice: order.totalPrice,
            shippingPrice: order.shippingPrice ?? "0",
            status: order.status,
            actualShippingCost: order.actualShippingCost ?? "0",
            notes: order.notes ?? "",
            deliveryTrackingId: order.deliveryTrackingId ?? "",
        },
    });

    const applyTotals = (qtys: Record<string, number>, removed: string[]) => {
        const { total, qty } = deriveTotals(qtys, removed);
        if (!isPriceManual) {
            form.setValue("totalPrice", String(total));
        }
        form.setValue("quantity", qty);
    };

    const handleQtyChange = (productId: string, val: number) => {
        const newQtys = { ...itemQtys, [productId]: val };
        setItemQtys(newQtys);
        applyTotals(newQtys, removedIds);
    };

    const handleRemoveItem = (productId: string) => {
        // لا يمكن تفريغ الطلب من كل منتجاته
        if (visibleItems.length <= 1) return;
        const newRemoved = [...removedIds, productId];
        setRemovedIds(newRemoved);
        applyTotals(itemQtys, newRemoved);
    };

    const onSubmit = (values: Order) => {
        startTransition(async () => {
            const orderItems = visibleItems.map((item: any) => ({
                productId: item.productId,
                qty: itemQtys[item.productId] ?? item.qty ?? 1,
            }));
            const res = await updateOrder({
                ...values,
                orderItems,
                removedProductIds: removedIds,
            });

            if (!res.success) {
                toast({ variant: "destructive", title: "Error", description: res.message });
            } else {
                setOpen(false);
                router.refresh();
                toast({ title: "Success", description: res.message });
            }
        });
    };

    const statuses = ['home', 'account', 'pending', 'completed', 'completedAccountant', 'returned', 'returnReceived', 'waiting', 'unavailable', 'banned', 'rescheduled', 'failed'];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{tCheckout("fullName")}</FormLabel>
                            <FormControl>
                                <Input placeholder={tCheckout("enterFullName")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{tCheckout("phoneNumber")}</FormLabel>
                            <FormControl>
                                <Input placeholder={tCheckout("phoneNumber")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="governorate"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{tCheckout("governorate")}</FormLabel>
                            <FormControl>
                                <Input placeholder={tCheckout("governorate")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{tCheckout("address")}</FormLabel>
                            <FormControl>
                                <Input placeholder={tCheckout("address")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Per-item quantity */}
                {visibleItems.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium">{t("quantity")}</p>
                        <div className="rounded-lg border divide-y">
                            {visibleItems.map((item: any, idx: number) => (
                                <div key={item.productId ?? idx} className="flex items-center justify-between px-3 py-2 gap-4">
                                    <span className="text-sm flex-1 truncate">{item.name}</span>
                                    <Input
                                        type="number"
                                        min={1}
                                        className="w-20 text-center"
                                        value={itemQtys[item.productId] ?? item.qty ?? 1}
                                        onChange={(e) =>
                                            handleQtyChange(item.productId, Math.max(1, parseInt(e.target.value) || 1))
                                        }
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                        title={t("delete")}
                                        aria-label={t("delete")}
                                        disabled={visibleItems.length <= 1}
                                        onClick={() => handleRemoveItem(item.productId)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        {removedIds.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                سيتم حذف المنتجات المُزالة نهائياً عند الضغط على «{t("Orders.update")}»
                            </p>
                        )}
                    </div>
                )}

                <FormField
                    control={form.control}
                    name="totalPrice"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                {t("price")}
                                {!isPriceManual && (
                                    <span className="text-xs text-muted-foreground mr-2">(محسوب تلقائياً)</span>
                                )}
                                {isPriceManual && (
                                    <span className="text-xs text-amber-600 mr-2">(يدوي)</span>
                                )}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    placeholder={t("price")}
                                    {...field}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        setIsPriceManual(true);
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("status")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("Orders.selectStatus")} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {statuses.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {t(`Orders.Status.${status}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("notes")}</FormLabel>
                            <FormControl>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder={t("enterNotes")}
                                    {...field}
                                    value={field.value || ''}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="actualShippingCost"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("actualShippingCost")}</FormLabel>
                            <FormControl>
                                <Input placeholder={t("actualShippingCost")} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="deliveryTrackingId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>رقم تتبّع التوصيل</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="رقم الباركود (اختياري)"
                                    {...field}
                                    value={field.value ?? ""}
                                    className="font-mono"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t("Orders.update")}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
