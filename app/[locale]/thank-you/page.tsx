"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CheckCircle2, ShoppingBag, Loader2 } from "lucide-react";
import Link from "next/link";
import OrderSuggestions from "@/components/shared/order-suggestions";

// UI Components
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Pixel Integrations
import FbPixel from "@/components/shared/facebook-pixel";

/** ما تُعيده صفحة الشكر من الخادم — بلا أي بيانات شخصية. */
type PurchaseEvent = {
  eventId: string;
  value: number;
  currency: string;
  contentIds: string[];
  numItems: number;
  redirectCategory: string;
  /** ملخّص يراه الزبون ليطمئنّ أن طلبه سُجّل — بلا أي بيانات شخصية. */
  summary: {
    orderNo: string;
    status: string;
    totalPrice: number;
    shippingPrice: number;
    items: { name: string; qty: number }[];
  };
};

const fmtIqd = (n: number) => `${n.toLocaleString("en-US")} د.ع`;

// مكون فرعي لاستخدام useSearchParams بأمان
function ThankYouContent() {
  const t = useTranslations("ThankYou");
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  // طلب مكرّر: الزبون أعاد طلب منتج موجود أصلاً في طلب قيد التجهيز. نُبقيه على
  // الصفحة (بلا تحويل تلقائي) حتى يقرأ التوضيح — وهذا ما يمنع محاولة ثالثة.
  const isDuplicate = searchParams.get("dup") === "1";

  // --- إعدادات التتبع ---
  // الخادم يُرسل حدث Conversions API ويُعيد بيانات البكسل فقط: لا اسم ولا هاتف
  // ولا بريد يصل المتصفح. ومعرّف الحدث ثابت (purchase-<orderId>) فتحديث الصفحة
  // لا يُسجَّل شراءً ثانياً عند ميتا، والنسختان (متصفح/خادم) تُدمجان.
  const [purchase, setPurchase] = useState<PurchaseEvent | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [loadError, setLoadError] = useState(false);
  const [redirectCategory, setRedirectCategory] = useState("");

  // جلب البيانات (يحدث مرة واحدة)
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setLoading(Boolean(orderId));
    if (!orderId) {
      setLoading(false);
      return;
    }

    import("@/lib/actions/order.actions").then(
      ({ getThankYouPurchaseData }) => {
        getThankYouPurchaseData(orderId)
          .then((data) => {
            if (cancelled) return;
            if (!data) {
              console.error("Order not found or null returned");
              setLoadError(true);
              return;
            }
            setPurchase(data);
            setRedirectCategory(data.redirectCategory);
          })
          .catch((err) => {
            if (cancelled) return;
            console.error("Error fetching order:", err);
            setLoadError(true);
          })
          .finally(() => { if (!cancelled) setLoading(false); });
      },
    ).catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6"
        dir="rtl"
      >
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-white px-10 py-8 text-center shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-semibold text-slate-700">
            جارٍ تحميل تفاصيل طلبك…
          </p>
        </div>
      </div>
    );
  }

  if (loadError || (orderId && !purchase)) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6"
        dir="rtl"
      >
        <Card className="w-full max-w-md p-8 text-center">
          <CardTitle className="text-xl">تعذر عرض تفاصيل الطلب</CardTitle>
          <CardDescription className="mt-3">
            حدّث الصفحة، وإذا استمرت المشكلة تواصل معنا مع رقم الطلب.
          </CardDescription>
          <Button asChild className="mt-6">
            <Link href="/ar">العودة إلى المتجر</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // بيانات حدث البكسل — جاهزة كما أتت من الخادم
  const pixelData = purchase
    ? {
        value: purchase.value,
        currency: purchase.currency,
        content_type: "product",
        content_ids: purchase.contentIds,
        num_items: purchase.numItems,
      }
    : null;
  // End API Code

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
      {/* Start Pixel Code */}

      {purchase && pixelData && (
        <FbPixel
          eventName="Purchase"
          eventId={purchase.eventId}
          data={pixelData}
        />
      )}
      {/* End Pixel Code */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-3xl relative"
      >
        {/* Decorative Blur Background */}
        <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 to-blue-50/50 rounded-full blur-3xl -z-10 opacity-70"></div>

        <Card className="text-center border-slate-100 shadow-[0_30px_60px_-15px_rgba(8,112,184,0.1)] bg-white/80 backdrop-blur-xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-400"></div>
          <CardHeader className="pt-10 pb-6">
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.1,
              }}
              className="flex justify-center mb-6"
            >
              <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center ring-8 ring-primary/5">
                <CheckCircle2 className="w-12 h-12 text-primary fill-transparent" />
              </div>
            </motion.div>
            <CardTitle className="text-3xl font-serif font-bold text-slate-800">
              {purchase?.summary.status === "home"
                ? t("receivedTitle")
                : t("title")}
            </CardTitle>
            <CardDescription className="text-lg text-slate-500 mt-2">
              {t("description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-8">
            {/* تنبيه الطلب المكرّر — يجيب على سؤال الزبون الحقيقي: هل نجح طلبي؟ */}
            {isDuplicate && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-right">
                <p className="font-bold text-amber-900 text-sm mb-1">
                  طلبك السابق ما زال قيد التجهيز
                </p>
                <p className="text-amber-800 text-sm leading-relaxed">
                  هذا المنتج موجود أصلاً في طلبك أدناه، فلم نُضِف نسخة ثانية
                  منه. إن كنت تريد قطعة إضافية فعلاً أخبرنا عند اتصال موظّف
                  التأكيد.
                </p>
              </div>
            )}

            {purchase?.summary ? (
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-right space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs tracking-wider text-slate-400 font-medium">
                    {t("orderReference")}
                  </span>
                  <span className="font-mono font-bold text-lg text-slate-900">
                    #{purchase.summary.orderNo}
                  </span>
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-1.5">
                  {purchase.summary.items.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between text-sm text-slate-600 gap-3"
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0 font-semibold text-slate-800">
                        × {item.qty}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">
                    الإجمالي مع التوصيل
                  </span>
                  <span className="font-bold text-lg text-primary">
                    {fmtIqd(purchase.summary.totalPrice)}
                  </span>
                </div>
              </div>
            ) : (
              orderId && (
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col items-center justify-center">
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-medium mb-1">
                    {t("orderReference")}
                  </p>
                  <p className="font-mono font-bold text-xl text-slate-900 tracking-wide">
                    {orderId}
                  </p>
                </div>
              )
            )}

            <p className="text-slate-600 leading-relaxed text-sm">
              {purchase?.summary.status === "home"
                ? t("receivedMessage")
                : t("message")}
            </p>
          </CardContent>
          {orderId && purchase && (
            <div className="px-6 pb-6">
              <OrderSuggestions
                orderId={orderId}
                onAdded={() => {
                  import("@/lib/actions/upsell.actions")
                    .then(({ getOrderReceipt }) => getOrderReceipt(orderId))
                    .then((summary) =>
                      setPurchase((previous) =>
                        previous ? { ...previous, summary } : previous,
                      ),
                    );
                }}
              />
            </div>
          )}
          <CardFooter className="flex flex-col gap-5 pb-8 px-8">
            <Button
              asChild
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
            >
              <Link
                href={
                  redirectCategory
                    ? `/ar/search?category=${encodeURIComponent(redirectCategory)}`
                    : "/ar"
                }
                className="flex items-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                {t("continueShopping")}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  );
}
