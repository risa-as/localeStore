"use client";
import { useEffect, useState, useTransition } from "react";
import { addProductToExistingOrder, getOrderSuggestions } from "@/lib/actions/upsell.actions";
import { formatCurrency } from "@/lib/utils";
type Suggestion = Awaited<ReturnType<typeof getOrderSuggestions>>[number];

export default function OrderSuggestions({ orderId, onAdded }: { orderId: string; onAdded?: () => void }) {
  const [products, setProducts] = useState<Suggestion[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { getOrderSuggestions(orderId).then(setProducts).catch(() => setProducts([])); }, [orderId]);
  if (!products.length && !message) return null;
  return <section className="space-y-4 text-right w-full" dir="rtl"><h2 className="text-lg font-bold">أضف إلى طلبك نفسه</h2><p className="text-sm text-muted-foreground">لا تحتاج إعادة كتابة بياناتك. تظهر الزيادة الكاملة قبل الإضافة.</p>{message && <p role="status" className="text-sm">{message}</p>}<div className="grid gap-3 sm:grid-cols-3">{products.map(product => <article key={product.id} className="border rounded-xl p-3 space-y-3"><img src={product.image} alt={product.name} className="w-full aspect-square object-contain rounded-lg"/><h3 className="font-semibold text-sm">{product.name}</h3><p className="text-sm">سعر المنتج: {formatCurrency(product.price)}</p><p className="text-xs">زيادة التوصيل: {formatCurrency(product.additionalShipping)}</p><p className="font-bold text-sm">الإضافة كاملة: {formatCurrency(product.totalIncrement)}</p>{product.colors.length > 0 && <select aria-label={`لون ${product.name}`} className="w-full border rounded p-2 bg-background" value={colors[product.id] ?? ""} onChange={event => setColors({ ...colors, [product.id]: event.target.value })}><option value="">اختر اللون</option>{product.colors.map(color => <option key={color}>{color}</option>)}</select>}<button disabled={pending || (product.colors.length > 0 && !colors[product.id])} className="w-full rounded-lg bg-primary text-primary-foreground py-2 disabled:opacity-50" onClick={() => start(async () => { const result = await addProductToExistingOrder({ orderId, productId: product.id, color: colors[product.id], expectedIncrement: product.totalIncrement }); setMessage(result.message); setProducts(await getOrderSuggestions(orderId)); if (result.success) { onAdded?.(); } })}>{pending ? "جارٍ الإضافة…" : "أضف إلى طلبي"}</button></article>)}</div></section>;
}
