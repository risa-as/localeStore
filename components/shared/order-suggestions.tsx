"use client";
import { AppSelect } from "@/components/ui/app-select";
import { useEffect, useState, useTransition } from "react";
import { addProductToExistingOrder, getOrderSuggestions } from "@/lib/actions/upsell.actions";
import { formatCurrency } from "@/lib/utils";
type Suggestion = Awaited<ReturnType<typeof getOrderSuggestions>>[number];

export default function OrderSuggestions({ orderId, onAdded, onLoaded, onActivity, onBusyChange }: {
  orderId: string;
  onAdded?: () => void;
  /** عدد المقترحات بعد أول تحميل. */
  onLoaded?: (count: number) => void;
  /** الزبون يتفاعل مع المقترحات (اختيار لون). */
  onActivity?: () => void;
  /** إضافة منتج جارية. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [products, setProducts] = useState<Suggestion[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    getOrderSuggestions(orderId)
      .then((list) => { setProducts(list); onLoaded?.(list.length); })
      .catch(() => { setProducts([]); onLoaded?.(0); });
    // يُحمَّل مرة لكل طلب؛ الدوال من الأب لا تعيد التحميل.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  useEffect(() => { onBusyChange?.(pending); }, [pending, onBusyChange]);
  if (!products.length && !message) return null;
  return <section className="space-y-4 text-right w-full" dir="rtl"><h2 className="text-lg font-bold">أضف إلى طلبك نفسه</h2><p className="text-sm text-muted-foreground">لا تحتاج إعادة كتابة بياناتك. تظهر الزيادة الكاملة قبل الإضافة.</p>{message && <p role="status" className="text-sm">{message}</p>}<div className="grid gap-3 sm:grid-cols-3">{products.map(product => <article key={product.id} className="border rounded-xl p-3 space-y-3"><img src={product.image} alt={product.name} className="w-full aspect-square object-contain rounded-lg"/><h3 className="font-semibold text-sm">{product.name}</h3><p className="text-sm">سعر المنتج: {formatCurrency(product.price)}</p><p className="text-xs">زيادة التوصيل: {formatCurrency(product.additionalShipping)}</p><p className="font-bold text-sm">الإضافة كاملة: {formatCurrency(product.totalIncrement)}</p>{product.colors.length > 0 && <AppSelect aria-label={`لون ${product.name}`} value={colors[product.id] ?? ""} onValueChange={color => { setColors({ ...colors, [product.id]: color }); onActivity?.(); }} placeholder="اختر اللون" options={product.colors.map(color => ({ value: color, label: color }))} />}<button disabled={pending || (product.colors.length > 0 && !colors[product.id])} className="w-full rounded-lg bg-primary text-primary-foreground py-2 disabled:opacity-50" onClick={() => start(async () => { const result = await addProductToExistingOrder({ orderId, productId: product.id, color: colors[product.id], expectedIncrement: product.totalIncrement }); setMessage(result.message); setProducts(await getOrderSuggestions(orderId)); if (result.success) { onAdded?.(); } })}>{pending ? "جارٍ الإضافة…" : "أضف إلى طلبي"}</button></article>)}</div></section>;
}
