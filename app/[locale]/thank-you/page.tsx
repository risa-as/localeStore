"use client"
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { v4 as uuidv4 } from 'uuid';
import { motion } from "framer-motion";
import { CheckCircle2, ShoppingBag, ArrowRight } from "lucide-react";
import Link from "next/link";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Pixel Integrations
import { sendCAPIEvent } from "@/lib/actions/facebook.actions";
import FbPixel from "@/components/shared/facebook-pixel";

// مكون فرعي لاستخدام useSearchParams بأمان
function ThankYouContent() {
    const t = useTranslations('ThankYou');
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderId = searchParams.get('orderId');
    const [timeLeft, setTimeLeft] = useState(155);


    // --- إعدادات التتبع ---
    const [eventId] = useState(() => uuidv4());
    const [orderData, setOrderData] = useState<any>(null);

    // جلب البيانات (يحدث مرة واحد)
    useEffect(() => {
        if (orderId) {
            import("@/lib/actions/order.actions").then(({ getOrderById }) => {
                getOrderById(orderId).then((order) => {
                    if (order) {
                        setOrderData(order);

                        // Send CAPI Event with Real Data
                        sendCAPIEvent("Purchase", eventId, {
                            eventSourceUrl: window.location.href,
                            value: Number(order.totalPrice),
                            currency: "USD",
                            // Add User Data
                            email: order.user?.email,
                            phone: order.phoneNumber,
                            firstName: order.fullName?.split(" ")[0],
                            lastName: order.fullName?.split(" ").slice(1).join(" "),
                            city: order.governorate, // Assuming governorate maps to city/region
                            country: "IQ", // Assuming Iraq based on context
                            externalId: order.id, // Add External ID
                        }).catch(() => { });
                    } else {
                        console.error("Order not found or null returned");
                    }
                }).catch(err => console.error("Error fetching order:", err));
            });
        }
    }, [orderId, eventId]);

    // 2. تجهيز بيانات البكسل (يتم إنشاؤها فقط عند توفر الطلب)
    // استخدام useMemo يمنع إعادة إنشاء الكائن عند تغير العداد timeLeft
    const pixelData = useMemo(() => {
        // إذا لم تتوفر البيانات بعد، نرجع null
        if (!orderData) return null;

        return {
            value: Number(orderData.totalPrice),
            currency: "USD",
            content_name: "Order " + orderData.id,
            content_type: "product",
            content_ids: orderData.orderitems?.map((item: any) => item.productId) || [],
            num_items: orderData.orderitems?.length || 0
        };
    }, [orderData]); // <--- يراقب orderData فقط
    // End API Code

    // 3. العداد التنازلي
    useEffect(() => {
        if (timeLeft === 0) {
            router.push('/ar'); // Redirect to store home
            return;
        }

        const intervalId = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(intervalId);
    }, [timeLeft, router]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
            {/* Start Pixel Code */}

            {orderData && pixelData && (
                <FbPixel
                    eventName="Purchase"
                    eventId={eventId}
                    data={pixelData}
                />
            )}
            {/* End Pixel Code */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative"
            >
                {/* Decorative Blur Background */}
                <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 to-blue-50/50 rounded-full blur-3xl -z-10 opacity-70"></div>

                <Card className="text-center border-slate-100 shadow-[0_30px_60px_-15px_rgba(8,112,184,0.1)] bg-white/80 backdrop-blur-xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-400"></div>
                    <CardHeader className="pt-10 pb-6">
                        <motion.div
                            initial={{ scale: 0, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                            className="flex justify-center mb-6"
                        >
                            <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center ring-8 ring-primary/5">
                                <CheckCircle2 className="w-12 h-12 text-primary fill-transparent" />
                            </div>
                        </motion.div>
                        <CardTitle className="text-3xl font-serif font-bold text-slate-800">{t('title')}</CardTitle>
                        <CardDescription className="text-lg text-slate-500 mt-2">
                            {t('description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 px-8">
                        {orderId && (
                            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col items-center justify-center">
                                <p className="text-xs uppercase tracking-wider text-slate-400 font-medium mb-1">{t('orderReference')}</p>
                                <p className="font-mono font-bold text-xl text-slate-900 tracking-wide">{orderId}</p>
                            </div>
                        )}
                        <p className="text-slate-600 leading-relaxed text-sm">
                            {t('message')}
                        </p>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-5 pb-8 px-8">
                        <Button asChild className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
                            <Link href="/en" className="flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4" />
                                {t('continueShopping')}
                            </Link>
                        </Button>
                        <div className="text-xs font-medium text-slate-400 animate-pulse flex items-center justify-center gap-1">
                            {t('redirecting')} <span className="text-primary font-bold">{timeLeft}s</span> <ArrowRight className="w-3 h-3" />
                        </div>
                    </CardFooter>
                </Card>
            </motion.div>
        </div>
    );
}

export default function ThankYouPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ThankYouContent />
        </Suspense>
    );
}
