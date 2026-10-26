"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ClipboardCheck, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { prepareSocialInboxOrder, approveSocialInboxOrder, searchSocialInboxProducts } from "@/lib/actions/social-inbox.actions";
import { insertOrderSchema } from "@/lib/validators";
import { iraqGovernorates } from "@/lib/constants";
import { SOCIAL_ORDER_NAME } from "@/lib/meta/inbox-order";
import { computeOrderPricing } from "@/lib/pricing";
import { money, type InboxProduct } from "@/lib/meta/inbox-tools";
import type { SocialPlatform } from "@/lib/meta/inbox";
import type { SelectedOrderFields } from "@/lib/meta/inbox-workflow";

type Scope = { pageId: string; platform: SocialPlatform; handle: string };
type Fields = { phoneNumber: string; governorate: string; address: string; quantity: number; selectedColor: string };
type Approved = { orderId: string; kind: "created" | "merged" | "duplicate"; replay: boolean };
const control = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export default function SocialInboxOrder({ scope, suggestedProduct, disabled, onWorking, selectedFields, onSelectedFieldChange }: {
  scope: Scope; suggestedProduct?: InboxProduct; disabled: boolean; onWorking: (working: boolean) => void;
  selectedFields?: SelectedOrderFields;
  onSelectedFieldChange?: (field: "phoneNumber" | "address", value: string) => void;
}) {
  const locale = useLocale(), tGov = useTranslations("Governorates");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [products, setProducts] = useState<InboxProduct[]>([]);
  const [product, setProduct] = useState<InboxProduct | null>(null);
  const [baseFields, setFields] = useState<Fields>({ phoneNumber: "", governorate: "", address: "", quantity: 1, selectedColor: "" });
  const fields = { ...baseFields, ...selectedFields };
  const [linked, setLinked] = useState<{ id: string; status: string; phoneNumber: string }[]>([]);
  const [approved, setApproved] = useState<Approved | null>(null);
  const requestId = useRef<string | null>(null);
  const approvedFields = useRef<SelectedOrderFields | null>(null);
  const working = useRef(false);
  const searchSequence = useRef(0);
  function chooseProduct(item: InboxProduct) {
    setProduct(item); setFields(prev => ({ ...prev, selectedColor: item.colors?.[0] || "" }));
  }
  async function prepare() {
    setLoading(true); setError("");
    try {
      const result = await prepareSocialInboxOrder({ ...scope, productId: suggestedProduct?.id });
      if (!result.ok) { setError(result.message); return; }
      const data = result.data;
      setFields({ phoneNumber: data.phoneNumber, governorate: data.governorate, address: data.address, quantity: data.quantity, selectedColor: "" });
      setWarnings([...data.warnings, ...(data.hasOlderMessages ? ["التعبئة تعتمد على آخر 50 رسالة؛ راجع البيانات إذا كان الحجز أقدم."] : [])]);
      setProducts(data.products); setLinked(data.linked.map(item => ({ id: item.id, status: item.status, phoneNumber: item.phoneNumber })));
      const suggested = data.products.find(item => item.id === suggestedProduct?.id);
      if (suggested || data.products.length === 1) chooseProduct(suggested || data.products[0]);
      setReady(true);
    } catch { setError("تعذر تجهيز المسودة؛ أعد المحاولة."); }
    finally { setLoading(false); }
  }
  async function search() {
    const sequence = ++searchSequence.current;
    setSearching(true); setError("");
    try {
      const result = await searchSocialInboxProducts(query, locale);
      if (sequence !== searchSequence.current) return;
      if (result.ok) setProducts(result.data); else setError(result.message);
    } catch { setError("تعذر البحث عن المنتج"); }
    finally { if (sequence === searchSequence.current) setSearching(false); }
  }
  const validation = insertOrderSchema.safeParse({ ...fields, address: fields.address.trim(), fullName: SOCIAL_ORDER_NAME });
  const validColor = !product?.colors?.length || product.colors.includes(fields.selectedColor);
  // Stock is deliberately checked by the shared checkout after resolving duplicates;
  // an existing reservation may legitimately leave zero available for new orders.
  const canApprove = ready && product && validation.success && iraqGovernorates.includes(fields.governorate) && validColor;
  const pricing = product ? computeOrderPricing({ quantity: fields.quantity, unitPrice: product.price, shippingPrice: product.shippingPrice, offers: product.offers }) : null;
  async function approve() {
    if (working.current || !canApprove || !product) return;
    working.current = true; setPending(true); onWorking(true); setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const result = await approveSocialInboxOrder({ ...scope, ...fields, productId: product.id, requestId: requestId.current });
      if (result.ok) { setApproved(result.data); approvedFields.current = { phoneNumber: fields.phoneNumber, address: fields.address }; }
      else setError(result.message);
    } catch { setError("تعذر التحقق من نتيجة الاعتماد. أعد المحاولة بنفس المسودة؛ لن يُنشأ طلب ثانٍ."); }
    finally { working.current = false; setPending(false); onWorking(false); }
  }
  return <Dialog open={open} onOpenChange={value => {
    if (working.current) return;
    setOpen(value);
    const changedAfterApproval = approved && approvedFields.current &&
      (fields.phoneNumber !== approvedFields.current.phoneNumber || fields.address !== approvedFields.current.address);
    if (value && changedAfterApproval) {
      setApproved(null); setReady(false); requestId.current = null; void prepare();
    } else if (value && !ready && !loading) void prepare();
  }}><DialogTrigger asChild><Button size="sm" variant="outline" disabled={disabled} title="تجهيز طلب من بيانات المحادثة"><ClipboardCheck className="size-4" /><span className="hidden sm:inline">تجهيز طلب</span><span className="sr-only sm:hidden">تجهيز طلب</span></Button></DialogTrigger>
    <DialogContent dir="rtl" className="max-w-xl max-h-[90dvh] overflow-auto" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => { if (pending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{approved ? "تم اعتماد الطلب" : "تجهيز طلب من المحادثة"}</DialogTitle></DialogHeader>
      {approved ? <div className="space-y-4">
        <p role="status" className="text-sm">{approved.replay ? "هذا الاعتماد محفوظ مسبقاً؛ أعدنا عرض الطلب نفسه." : approved.kind === "duplicate"
          ? "المنتج موجود في طلب سابق خلال 18 ساعة؛ احتفظنا بالكمية ولم نرسل تأكيداً مكرراً."
          : approved.kind === "merged" ? "أُضيف المنتج إلى طلب الزبون المفتوح، بتوصيل واحد." : "أُنشئ الطلب باسم زبون في قسم الطلبات الجديدة."}</p>
        <Button asChild className="w-full"><Link href={`/${locale}/admin/orders?status=home&query=${encodeURIComponent(fields.phoneNumber)}`}>فتح الطلبات برقم الهاتف</Link></Button>
        <Button asChild variant="outline" className="w-full"><Link href={`/${locale}/order/${approved.orderId}`}>فتح تفاصيل الطلب</Link></Button>
        <p className="text-xs text-muted-foreground" dir="ltr">#{approved.orderId.slice(0, 8)}</p>
        <Button variant="ghost" className="w-full" onClick={() => { setApproved(null); setReady(false); setProduct(null); requestId.current = null; void prepare(); }}>تجهيز منتج آخر</Button>
      </div> : loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />جارٍ قراءة بيانات الحجز…</p> : <>
        <p className="text-xs text-muted-foreground">راجع المسودة قبل الاعتماد. الاسم ثابت «زبون»، والسعر والمخزون والتكرار تُراجع عند الحفظ بنفس مسار صفحة الهبوط.</p>
        {linked.length > 0 && <div className="rounded-md border p-2 text-xs space-y-1"><p className="font-semibold">طلبات اعتمدت من هذه المحادثة</p>{linked.map(item => <Link key={item.id} className="block underline" href={`/${locale}/admin/orders?status=${encodeURIComponent(item.status)}&query=${encodeURIComponent(item.phoneNumber)}`}>#{item.id.slice(0, 8)} · {item.phoneNumber}</Link>)}</div>}
        {warnings.length > 0 && <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc ps-4">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
        {ready && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void approve(); }}>
          <fieldset disabled={pending} className="space-y-3">
            <div className="flex gap-2"><input aria-label="البحث عن منتج للحجز" maxLength={120} className={control} value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم المنتج للحجز…" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /><Button type="button" size="icon" variant="outline" aria-label="بحث عن منتج للحجز" disabled={searching} onClick={() => void search()}>{searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</Button></div>
            {!!products.length && (products.length > 1 || products[0].id !== product?.id) && <div className="max-h-36 overflow-auto space-y-1" role="group" aria-label="اختيار المنتج للحجز">{products.map(item => <button key={item.id} type="button" aria-pressed={product?.id === item.id} className={`w-full rounded-md border px-3 py-2 text-start text-sm ${product?.id === item.id ? "border-primary bg-primary/5" : ""}`} onClick={() => chooseProduct(item)}>{item.name}<span className="block text-xs text-muted-foreground">{money(item.price)} · المتاح {item.available}</span></button>)}</div>}
            {!product && <p className="text-xs text-muted-foreground">اختر المنتج المقصود. يمكن التعرف عليه من رابط المتجر أو اختياره من أدوات الرد قبل التجهيز.</p>}
            {product && <div className="rounded-md bg-muted p-2 text-sm font-medium">المنتج: {product.name}<p className="text-xs text-muted-foreground font-normal mt-1">{money(product.price)} للقطعة · المتاح {product.available}</p></div>}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs space-y-1"><span>الاسم</span><input value={SOCIAL_ORDER_NAME} readOnly className={`${control} text-muted-foreground`} /></label>
              <label className="text-xs space-y-1"><span>رقم الهاتف</span><input required dir="ltr" inputMode="tel" maxLength={25} value={fields.phoneNumber} onChange={event => { setFields({ ...fields, phoneNumber: event.target.value }); onSelectedFieldChange?.("phoneNumber", event.target.value); }} className={control} /></label>
              <label className="text-xs space-y-1"><span>المحافظة</span><select required value={fields.governorate} onChange={event => setFields({ ...fields, governorate: event.target.value })} className={control}><option value="">اختر المحافظة</option>{iraqGovernorates.map(gov => <option key={gov} value={gov}>{tGov(gov)}</option>)}</select></label>
              <label className="text-xs space-y-1"><span>الكمية</span><input required type="number" min={1} step={1} value={fields.quantity || ""} onChange={event => setFields({ ...fields, quantity: Number(event.target.value) })} className={control} /></label>
            </div>
            <label className="block text-xs space-y-1"><span>العنوان وأقرب نقطة دالة</span><textarea aria-label="العنوان وأقرب نقطة دالة" required minLength={3} maxLength={1000} rows={2} value={fields.address} onChange={event => { setFields({ ...fields, address: event.target.value }); onSelectedFieldChange?.("address", event.target.value); }} className={control} /></label>
            {!!product?.colors?.length && <label className="block text-xs space-y-1"><span>اللون</span><select value={fields.selectedColor} onChange={event => setFields({ ...fields, selectedColor: event.target.value })} className={control}>{product.colors.map(color => <option key={color}>{color}</option>)}</select></label>}
          </fieldset>
          {pricing && <div className="rounded-lg border p-3 text-sm space-y-1"><div className="flex justify-between"><span>المنتج × {fields.quantity || 1}</span><span>{money(pricing.itemsPrice)}</span></div><div className="flex justify-between"><span>التوصيل</span><span>{money(pricing.shippingPrice)}</span></div><div className="flex justify-between font-bold"><span>الإجمالي التقديري</span><span>{money(pricing.totalPrice)}</span></div><p className="text-[11px] text-muted-foreground">عند الدمج يُحسب إجمالي الطلب القائم وتوصيله من جديد. المنتج الموجود لا تُزاد كميته.</p></div>}
          {!validation.success && <p className="text-xs text-muted-foreground">أكمل رقم هاتف عراقي صحيح، والمحافظة، والعنوان، وكمية صحيحة.</p>}
          <Button type="submit" className="w-full" disabled={!canApprove || pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}اعتماد وإنشاء الطلب</Button>
        </form>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && !ready && !approved && <Button variant="outline" onClick={() => void prepare()}>إعادة التجهيز</Button>}
    </DialogContent>
  </Dialog>;
}
