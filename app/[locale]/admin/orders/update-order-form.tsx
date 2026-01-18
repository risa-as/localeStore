"use client";

import { useTransition } from "react";
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
import { Loader2 } from "lucide-react";

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
    const [isPending, startTransition] = useTransition();

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
            status: order.status,
        },
    });

    const onSubmit = (values: Order) => {
        startTransition(async () => {
            const res = await updateOrder(values);

            if (!res.success) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: res.message,
                });
            } else {
                toast({
                    title: "Success",
                    description: res.message,
                });
                setOpen(false);
            }
        });
    };

    const statuses = ['home', 'account', 'pending', 'completed', 'returned', 'waiting'];

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
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("status")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Status" />
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
