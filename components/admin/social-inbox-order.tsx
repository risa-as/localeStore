"use client";
import { AppSelect } from "@/components/ui/app-select";

import { useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { ClipboardCheck, ExternalLink, Loader2, MapPin, Minus, Package, Plus, Search, ShoppingBasket, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { prepareSocialInboxOrder, approveSocialInboxOrder, searchSocialInboxProducts } from "@/lib/actions/social-inbox.actions";
import { MAX_QUICK_ORDER_PRODUCTS, quickOrderCustomerSchema, quickOrderLinesSchema } from "@/lib/orders/quick-order-input";
import { iraqGovernorates } from "@/lib/constants";
import { SOCIAL_ORDER_NAME } from "@/lib/meta/inbox-order";
import { computeItemsPriceTotal, computeOrderPricing } from "@/lib/pricing";
import { money, type InboxProduct } from "@/lib/meta/inbox-tools";
import type { SocialPlatform } from "@/lib/meta/inbox";
import { inboxOrderLookupHref, type SelectedOrderFields } from "@/lib/meta/inbox-workflow";

type Scope = { pageId: string; platform: SocialPlatform; handle: string };
type Fields = { phoneNumber: string; governorate: string; address: string };
type DraftLine = { product: InboxProduct; quantity: number; selectedColor: string };
const control = "w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const fieldError = "text-xs leading-normal text-destructive";
const productColumns = "lg:grid-cols-[minmax(0,1fr)_5.5rem_5rem_5.5rem_2rem]";
const draftLine = (product: InboxProduct, quantity: number): DraftLine => ({ product, quantity, selectedColor: product.colors?.[0] || "" });

export default function SocialInboxOrder({ scope, suggestedProduct, disabled, onWorking, selectedFields, onSelectedFieldChange, source, onApproved }: {
  scope: Scope; suggestedProduct?: InboxProduct; disabled: boolean; onWorking: (working: boolean) => void;
  selectedFields?: SelectedOrderFields;
  onSelectedFieldChange?: (field: "phoneNumber" | "address", value: string) => void;
  /** Register the order from a comment (scope.handle is then the comment) instead of a conversation. */
  source?: { kind: "comment"; postHandle: string };
  onApproved?: () => void;
}) {
  const fromComment = source?.kind === "comment";
  const locale = useLocale(), tGov = useTranslations("Governorates");
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [products, setProducts] = useState<InboxProduct[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [initialQuantity, setInitialQuantity] = useState(1);
  const [baseFields, setFields] = useState<Fields>({ phoneNumber: "", governorate: "", address: "" });
  const fields = { ...baseFields, ...selectedFields };
  const [linkedOrders, setLinkedOrders] = useState<{ id: string; status: string; phoneNumber: string }[]>([]);
  const requestId = useRef<string | null>(null);
  const working = useRef(false);
  const searchSequence = useRef(0);
  const preparedAddress = useRef("");
  function addProduct(item: InboxProduct) {
    setDraft(previous => previous.length >= MAX_QUICK_ORDER_PRODUCTS || previous.some(line => line.product.id === item.id)
      ? previous : [...previous, draftLine(item, previous.length ? 1 : initialQuantity)]);
  }
  function editLine(id: string, changes: Partial<Pick<DraftLine, "quantity" | "selectedColor">>) {
    setDraft(previous => previous.map(line => line.product.id === id ? { ...line, ...changes } : line));
  }
  async function prepare() {
    setLoading(true); setError("");
    searchSequence.current++;
    setSearching(false); setSearched(false); setQuery("");
    try {
      const result = await prepareSocialInboxOrder({ ...scope, productId: suggestedProduct?.id, source });
      if (!result.ok) { setError(result.message); return; }
      const data = result.data;
      preparedAddress.current = data.address.trim();
      setFields({ phoneNumber: data.phoneNumber, governorate: data.governorate, address: data.address });
      setInitialQuantity(data.quantity);
      setWarnings([
        ...data.warnings,
        ...(data.hasOlderMessages ? ["راجع الرسائل الأقدم إذا كان الحجز قبل آخر 50 رسالة."] : []),
      ]);
      setProducts(data.products); setLinkedOrders(data.linked);
      const suggested = data.products.find(item => item.id === suggestedProduct?.id) ?? (data.products.length === 1 ? data.products[0] : undefined);
      setDraft(suggested ? [draftLine(suggested, data.quantity)] : []);
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
      if (result.ok) { setProducts(result.data); setSearched(true); } else setError(result.message);
    } catch { if (sequence === searchSequence.current) setError("تعذر البحث عن المنتج"); }
    finally { if (sequence === searchSequence.current) setSearching(false); }
  }
  const validation = quickOrderCustomerSchema.safeParse({ ...fields, address: fields.address.trim(), fullName: SOCIAL_ORDER_NAME });
  const fieldIssues = validation.error?.issues.map(issue => issue.path[0]) ?? [];
  const invalidPhone = fieldIssues.includes("phoneNumber");
  const invalidGovernorate = !iraqGovernorates.includes(fields.governorate);
  const invalidAddress = fieldIssues.includes("address");
  const reviewAddress = !invalidAddress && fields.address.trim() === preparedAddress.current
    && warnings.some(warning => warning.startsWith("اقتُرح العنوان من نص الرسالة"));
  const reviewWarnings = warnings.filter(warning => !warning.startsWith("لم أجد عنواناً بصيغة واضحة") && !warning.startsWith("اقتُرح العنوان من نص الرسالة"));
  const lines = quickOrderLinesSchema.safeParse(draft.map(({ product, quantity, selectedColor }) => ({ productId: product.id, quantity, selectedColor })));
  const lineIssue = lines.error?.issues[0];
  const validColors = draft.every(({ product, selectedColor }) => !product.colors?.length || product.colors.includes(selectedColor));
  const canApprove = ready && validation.success && !invalidGovernorate && lines.success && validColors;
  const itemsPrice = computeItemsPriceTotal(draft.map(({ product, quantity }) => ({ productId: product.id, unitPrice: product.price, quantity })), new Map(draft.map(({ product }) => [product.id, product.offers])));
  const shippingPrice = draft.length ? Math.max(...draft.map(({ product }) => product.shippingPrice)) : 0;
  const draftIds = new Set(draft.map(line => line.product.id));
  const availableResults = products.filter(product => !draftIds.has(product.id));
  async function approve() {
    if (working.current || !canApprove || !lines.success) return;
    working.current = true; setPending(true); onWorking(true); setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const result = await approveSocialInboxOrder({ ...scope, ...fields, items: lines.data, requestId: requestId.current, source });
      if (!result.ok) { setError(result.message); return; }
      setOpen(false); setReady(false); setDraft([]); requestId.current = null;
      toast({ title: result.data.replay || result.data.kind === "duplicate" ? "الطلب محفوظ مسبقاً"
        : result.data.kind === "merged" ? "تمت الإضافة إلى الطلب القائم" : "تم اعتماد الطلب" });
    } catch { setError("تعذر التحقق من نتيجة الاعتماد. أعد المحاولة بنفس المسودة؛ لن يُنشأ طلب ثانٍ."); return; }
    finally { working.current = false; setPending(false); onWorking(false); }
    onApproved?.();
  }
  return <Dialog open={open} onOpenChange={value => {
    if (working.current) return;
    setOpen(value);
    if (value && !ready && !loading) void prepare();
  }}>
    <DialogTrigger asChild>{fromComment
      ? <Button size="sm" variant="outline" className="h-7 gap-1 border-emerald-500/50 px-2 text-xs text-emerald-800 dark:text-emerald-300" disabled={disabled} title="إنشاء الطلب من بيانات التعليق"><ClipboardCheck className="size-3.5" />تسجيل الطلب</Button>
      : <Button size="sm" variant="outline" disabled={disabled} title="تجهيز طلب من بيانات المحادثة"><ClipboardCheck className="size-4" /><span className="hidden sm:inline">تجهيز طلب</span><span className="sr-only sm:hidden">تجهيز طلب</span></Button>}
    </DialogTrigger>
    <DialogContent dir="rtl"
      className="flex max-h-[calc(100dvh-1.25rem)] w-[calc(100%-1.25rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-[10px] p-0 sm:rounded-[10px] [&>button:last-child]:left-3 [&>button:last-child]:right-auto [&>button:last-child]:top-2.5 [&>button:last-child]:grid [&>button:last-child]:size-8 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-[10px]"
      onEscapeKeyDown={event => { if (working.current) event.preventDefault(); }}
      onPointerDownOutside={event => { if (working.current) event.preventDefault(); }}>
      <DialogHeader className="shrink-0 border-b px-3 py-2.5 pe-12 text-start sm:px-4 sm:pe-12 sm:text-start">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><ShoppingBasket aria-hidden="true" className="size-4" /></span>
          <DialogTitle className="text-base leading-snug">{fromComment ? "تسجيل طلب من التعليق" : "تجهيز طلب من المحادثة"}</DialogTitle>
        </div>
        <DialogDescription className="sr-only">حدد المنتجات وبيانات التوصيل لاعتماد طلب باسم زبون.</DialogDescription>
      </DialogHeader>
      {loading ? <p role="status" className="flex items-center gap-2 px-5 py-8 text-sm"><Loader2 className="size-4 animate-spin" />جارٍ تجهيز المسودة…</p>
      : !ready ? <div className="space-y-3 p-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" onClick={() => void prepare()}>إعادة التجهيز</Button>
      </div>
      : <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void approve(); }}>
        <div className="relative min-h-0 overflow-y-auto overscroll-contain">
        <fieldset disabled={pending} className="min-w-0 p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:items-start">
            <section aria-label="المنتجات في الطلب" className="min-w-0 space-y-3">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input aria-label="البحث عن منتج للحجز" maxLength={120} className={control + " h-9 ps-9"} value={query}
                    onChange={event => setQuery(event.target.value)} placeholder="ابحث عن منتج لإضافته"
                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!searching) void search(); } }} />
                </div>
                <Button type="button" size="sm" variant="outline" className="h-9 rounded-[10px]" aria-label="بحث عن منتج للحجز" disabled={searching} onClick={() => void search()}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : "بحث"}
                </Button>
              </div>
              {!!availableResults.length && <div className="overflow-hidden rounded-[10px] border bg-muted/40">
                <p className="border-b px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{searched ? "نتائج البحث" : "منتجات مقترحة"}</p>
                <ul aria-label="نتائج البحث عن المنتجات" className="max-h-32 divide-y overflow-auto">
                  {availableResults.map(item => <li key={item.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-medium" title={item.name}>{item.name}</p>
                      <p className="flex flex-wrap items-baseline gap-x-2 pb-0.5 leading-loose text-muted-foreground">
                        <bdi className="whitespace-nowrap tabular-nums">{money(item.price)}</bdi>
                        {item.available < 1 && <span className="text-amber-700 dark:text-amber-400">غير متوفر</span>}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 rounded-[10px] px-2 text-xs"
                      aria-label={"إضافة " + item.name} disabled={draft.length >= MAX_QUICK_ORDER_PRODUCTS} onClick={() => addProduct(item)}><Plus className="size-3" />إضافة</Button>
                  </li>)}
                </ul>
              </div>}
              {searched && !searching && !availableResults.length && <p role="status" className="text-xs text-muted-foreground">{products.length ? "النتائج المطابقة مضافة إلى الطلب." : "لا توجد منتجات مطابقة."}</p>}
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">المنتجات المختارة</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{draft.length}</span>
              </div>
              {!draft.length ? <p className="rounded-[10px] border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">ابحث عن منتج وأضفه إلى الطلب.</p>
                : <div className="overflow-hidden rounded-[10px] border bg-card">
                  <div aria-hidden="true" className={`hidden gap-2 border-b bg-muted/40 px-2.5 py-1.5 text-center text-xs text-muted-foreground lg:grid ${productColumns}`}>
                    <span className="text-start">المنتج</span><span>الكمية</span><span>اللون</span><span>المبلغ</span>
                  </div>
                  <ul className="divide-y">
                    {draft.map(line => <DraftProductRow key={line.product.id} line={line} pending={pending}
                      onChange={changes => editLine(line.product.id, changes)}
                      onRemove={() => setDraft(previous => previous.filter(item => item.product.id !== line.product.id))} />)}
                  </ul>
                </div>}
            </section>
            <section aria-label="بيانات التوصيل" className="min-w-0 space-y-2.5 rounded-[10px] border bg-muted/25 p-2.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin aria-hidden="true" className="size-4 text-muted-foreground" />بيانات التوصيل</h3>
              <div className="grid grid-cols-2 items-start gap-2.5 md:grid-cols-1">
                <div className="min-w-0 space-y-1 text-xs">
                  <label htmlFor={`${fieldId}-phone`}>رقم الهاتف</label>
                  <input id={`${fieldId}-phone`} required dir="ltr" type="tel" inputMode="tel" maxLength={25}
                    aria-invalid={invalidPhone} aria-describedby={invalidPhone ? `${fieldId}-phone-error` : undefined}
                    value={fields.phoneNumber} onChange={event => { setFields(previous => ({ ...previous, phoneNumber: event.target.value })); onSelectedFieldChange?.("phoneNumber", event.target.value); }}
                    className={control + " h-9 tabular-nums aria-[invalid=true]:border-destructive/60"} />
                  {invalidPhone && <p id={`${fieldId}-phone-error`} className={fieldError}>أدخل رقم هاتف عراقياً صحيحاً.</p>}
                </div>
                <div className="min-w-0 space-y-1 text-xs">
                  <label htmlFor={`${fieldId}-governorate`}>المحافظة</label>
                  <AppSelect id={`${fieldId}-governorate`} name="governorate" required size="sm" aria-label="المحافظة" value={fields.governorate} disabled={pending}
                    className={`[&>button]:h-9 [&>button]:rounded-[10px] ${invalidGovernorate ? "[&>button]:border-destructive/60" : ""}`}
                    onValueChange={governorate => setFields(previous => ({ ...previous, governorate }))} placeholder="اختر المحافظة"
                    options={iraqGovernorates.map(gov => ({ value: gov, label: tGov(gov), keywords: [gov] }))} />
                  {invalidGovernorate && <p className={fieldError}>حدد محافظة التوصيل.</p>}
                </div>
                <div className="col-span-full min-w-0 space-y-1 text-xs">
                  <label htmlFor={`${fieldId}-address`}>العنوان وأقرب نقطة دالة</label>
                  <textarea id={`${fieldId}-address`} required minLength={3} maxLength={1000} rows={2}
                    aria-invalid={invalidAddress} aria-describedby={invalidAddress || reviewAddress ? `${fieldId}-address-hint` : undefined}
                    value={fields.address} onChange={event => { setFields(previous => ({ ...previous, address: event.target.value })); onSelectedFieldChange?.("address", event.target.value); }}
                    className={control + " block resize-y aria-[invalid=true]:border-destructive/60"} />
                  {invalidAddress && <p id={`${fieldId}-address-hint`} className={fieldError}>أدخل عنوان التوصيل.</p>}
                  {reviewAddress && <p id={`${fieldId}-address-hint`} className="text-muted-foreground">راجع العنوان المقترح قبل الاعتماد.</p>}
                </div>
              </div>
              {reviewWarnings.length > 0 && <div className="flex items-start gap-1.5 rounded-[10px] border border-amber-500/25 bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <ul className="space-y-1">
                  {reviewWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              </div>}
              {linkedOrders.length > 0 && <div className="space-y-1.5 border-t pt-2 text-xs">
                <h4 className="font-semibold">{fromComment ? "طلبات اعتمدت من هذا التعليق" : "طلبات اعتمدت من هذه المحادثة"}</h4>
                <ul className="space-y-1">
                  {linkedOrders.map(order => <li key={order.id}>
                    <Link href={inboxOrderLookupHref(locale, order)} prefetch={false} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-1.5 rounded-[10px] border bg-background px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <bdi dir="ltr" className="min-w-0 break-words tabular-nums">#{order.id.slice(0, 8)}{order.phoneNumber && ` · ${order.phoneNumber}`}</bdi>
                      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                    </Link>
                  </li>)}
                </ul>
              </div>}
            </section>
          </div>
        </fieldset>
        </div>
        <footer className="relative shrink-0 space-y-1.5 border-t bg-muted/30 px-3 py-2.5 sm:px-4">
          {error && <p role="alert" className="max-h-20 overflow-auto text-xs text-destructive">{error}</p>}
          {!error && draft.length > 0 && (lineIssue || !validColors) && <p className={fieldError}>{lineIssue?.path.length === 0 ? lineIssue.message : "تحقق من كمية المنتجات واللون المطلوب."}</p>}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">الإجمالي التقديري
                <bdi className="whitespace-nowrap pb-0.5 text-base font-bold leading-relaxed tabular-nums text-foreground" aria-live="polite">{lines.success ? money(itemsPrice + shippingPrice) : "—"}</bdi>
              </p>
              {lines.success && <p className="text-xs leading-relaxed text-muted-foreground">{shippingPrice > 0 ? "يشمل التوصيل " + money(shippingPrice) : "التوصيل مجاني"}</p>}
            </div>
            <Button type="submit" className="h-9 shrink-0 rounded-[10px] px-3" disabled={!canApprove || pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}{pending ? "جارٍ الاعتماد…" : "اعتماد الطلب"}
            </Button>
          </div>
        </footer>
      </form>}
    </DialogContent>
  </Dialog>;
}

function DraftProductRow({ line, pending, onChange, onRemove }: {
  line: DraftLine; pending: boolean; onChange: (changes: Partial<Pick<DraftLine, "quantity" | "selectedColor">>) => void; onRemove: () => void;
}) {
  const { product, quantity, selectedColor } = line;
  const short = quantity > product.available;
  const subtotal = quantity > 0 ? money(computeOrderPricing({ quantity, unitPrice: product.price, shippingPrice: 0, offers: product.offers }).itemsPrice) : "—";
  return <li className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 p-2.5 ${productColumns}`}>
    <div className="col-span-2 col-start-1 row-start-1 flex min-w-0 items-center gap-2 lg:col-span-1">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-muted text-muted-foreground">
        {product.image ? <Image src={product.image} alt="" width={36} height={36} className="size-full object-cover" unoptimized loading="lazy" /> : <Package aria-hidden="true" className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium leading-snug">{product.name}</p>
        {short && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{product.available > 0 ? "المتاح " + product.available + " فقط" : "غير متوفر"}</p>}
      </div>
    </div>
    <div className="grid h-8 grid-cols-[1.625rem_minmax(0,1fr)_1.625rem] overflow-hidden rounded-[10px] border bg-background max-lg:col-start-1 max-lg:row-start-2">
      <button type="button" className="grid place-items-center hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40" aria-label={"زيادة كمية " + product.name}
        onClick={() => onChange({ quantity: Math.max(0, Math.floor(quantity)) + 1 })}><Plus className="size-3.5" /></button>
      <input required type="number" min={1} step={1} inputMode="numeric" dir="ltr" value={quantity || ""} aria-label={"كمية " + product.name}
        onChange={event => onChange({ quantity: Number(event.target.value) })}
        className="h-full w-full min-w-0 appearance-none border-x bg-transparent text-center text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <button type="button" className="grid place-items-center hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40" disabled={quantity <= 1}
        aria-label={"تقليل كمية " + product.name} onClick={() => onChange({ quantity: Math.max(1, Math.floor(quantity) - 1) })}><Minus className="size-3.5" /></button>
    </div>
    <div className="min-w-0 max-lg:col-start-2 max-lg:row-start-2">
      {product.colors?.length ? <AppSelect size="sm" className="max-w-32 [&>button]:rounded-[10px]" aria-label={"لون " + product.name} value={selectedColor} disabled={pending}
        onValueChange={value => onChange({ selectedColor: value })} placeholder="اختر اللون" options={product.colors.map(color => ({ value: color, label: color }))} />
        : <span className="hidden text-center text-xs text-muted-foreground lg:block" aria-hidden="true">—</span>}
    </div>
    <bdi className="break-words pb-0.5 text-end text-xs font-semibold leading-loose tabular-nums max-lg:col-start-3 max-lg:row-start-2 lg:text-center">{subtotal}</bdi>
    <Button type="button" size="icon" variant="ghost" className="size-8 justify-self-end rounded-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-lg:col-start-3 max-lg:row-start-1"
      aria-label={"إزالة " + product.name} onClick={onRemove}><Trash2 className="size-3.5" /></Button>
  </li>;
}
