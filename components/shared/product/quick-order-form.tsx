"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { insertOrderSchema } from "@/lib/validators";
import { createQuickOrder } from "@/lib/actions/order.actions";
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
import { useToast } from "@/hooks/use-toast";
import { Minus, Plus, Loader2, ArrowRight } from "lucide-react";
import { Product } from "@/types";
import { useRouter } from "next/navigation";

interface QuickOrderFormProps {
    product: Product;
}

export function QuickOrderForm({ product }: QuickOrderFormProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const form = useForm({
        resolver: zodResolver(insertOrderSchema) as any,
        defaultValues: {
            fullName: "",
            phoneNumber: "",
            governorate: "",
            address: "",
            quantity: 1,
        },
    });

    const quantity = form.watch("quantity") as number;

    const incrementQty = () => {
        if (quantity < product.stock) {
            form.setValue("quantity", quantity + 1);
        }
    };

    const decrementQty = () => {
        if (quantity > 1) {
            form.setValue("quantity", quantity - 1);
        }
    };

    function onSubmit(data: z.infer<typeof insertOrderSchema>) {
        startTransition(async () => {
            const res = await createQuickOrder(data, product.id);

            if (!res.success) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: res.message,
                });
                return;
            }

            if (res.redirectTo) {
                router.push(res.redirectTo);
            }
        });
    }

    return (
        <div className="w-full">
            <h3 className="text-2xl lg:text-3xl font-serif font-medium mb-8 text-slate-900">
                Secure Your Order
            </h3>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Full Name</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="EX: JOHN DOE"
                                        {...field}
                                        className="bg-white/60 border-transparent h-14 rounded-2xl px-5 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-transparent transition-all shadow-sm"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="phoneNumber"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Phone</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="01xxxxxxxxx"
                                            {...field}
                                            className="bg-white/60 border-transparent h-14 rounded-2xl px-5 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-transparent transition-all shadow-sm"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="governorate"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">City</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Cairo"
                                            {...field}
                                            className="bg-white/60 border-transparent h-14 rounded-2xl px-5 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-transparent transition-all shadow-sm"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Address</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Street Name, Building No..."
                                        {...field}
                                        className="bg-white/60 border-transparent h-14 rounded-2xl px-5 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-transparent transition-all shadow-sm"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                            <FormItem className="space-y-2">
                                <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Quantity</FormLabel>
                                <FormControl>
                                    <div className="flex items-center justify-between bg-white/60 border border-transparent rounded-2xl p-1.5 shadow-sm h-14">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={decrementQty}
                                            disabled={quantity <= 1}
                                            className="h-11 w-11 rounded-xl hover:bg-white text-slate-600"
                                        >
                                            <Minus className="w-5 h-5" />
                                        </Button>
                                        <span className="text-slate-900 font-bold text-xl">{quantity}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={incrementQty}
                                            disabled={quantity >= product.stock}
                                            className="h-11 w-11 rounded-xl hover:bg-white text-slate-600"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </Button>
                                        <Input type="hidden" {...field} value={field.value as number} />
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Button
                        type="submit"
                        className="w-full h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-lg shadow-xl shadow-slate-900/20 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-slate-900/30 flex items-center justify-center gap-2 group mt-4"
                        disabled={isPending}
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                Complete Order <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </Button>
                </form>
            </Form>
        </div>
    );
}
