"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Search, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchSocialInboxOrdersByPhone } from "@/lib/actions/social-inbox.actions";
import { inboxPhoneCandidates, selectedOrderValue, inboxOrderLookupHref } from "@/lib/meta/inbox-workflow";
import { money } from "@/lib/meta/inbox-tools";
import type { InboxItem } from "@/lib/meta/inbox";

type SearchResult = Extract<Awaited<ReturnType<typeof searchSocialInboxOrdersByPhone>>, { ok: true }>["data"];
export default function SocialInboxOrderLookup({ messages, selectedPhone, disabled }: {
  messages: InboxItem[]; selectedPhone?: string; disabled: boolean;
}) {
  const locale = useLocale(), tStatus = useTranslations("Admin.Orders.Status"), tGov = useTranslations("Governorates");
  const [open, setOpen] = useState(false), [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const sequence = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const candidates = inboxPhoneCandidates(messages);
  let selected: string | undefined;
  try { if (selectedPhone) selected = selectedOrderValue("phoneNumber", selectedPhone); } catch { /* The draft may still be incomplete. */ }
  const phones = [...new Set([...(selected ? [selected] : []), ...candidates])];
  async function lookup(value: string) {
    const current = ++sequence.current;
    setPhone(value); setResult(null); setError(""); setLoading(true);
    try {
      const response = await searchSocialInboxOrdersByPhone(value);
      if (!alive.current || current !== sequence.current) return;
      if (response.ok) { setResult(response.data); setPhone(response.data.phoneNumber); }
      else setError(response.message);
    } catch { if (alive.current && current === sequence.current) setError("تعذر البحث عن الطلبات؛ أعد المحاولة."); }
    finally { if (alive.current && current === sequence.current) setLoading(false); }
  }
  return <Popover open={open} onOpenChange={value => {
    ++sequence.current; setOpen(value); setError(""); setResult(null); setLoading(false);
    if (value) { const initial = selected || (phones.length === 1 ? phones[0] : ""); setPhone(initial); if (initial) void lookup(initial); }
  }}><PopoverTrigger asChild><Button size="sm" variant="outline" disabled={disabled} title="بحث حالة الطلب برقم الهاتف" aria-label="بحث حالة الطلب"><Search className="size-4" /><span className="hidden sm:inline">حالة الطلب</span></Button></PopoverTrigger>
    <PopoverContent dir="rtl" align="end" className="w-[420px] max-w-[calc(100vw-2rem)] max-h-[70dvh] overflow-y-auto space-y-3">
      <h3 className="font-semibold text-sm">بحث حالة الطلب برقم الهاتف</h3>
      {!!phones.length && <div className="space-y-1.5"><p className="text-xs text-muted-foreground">أرقام الزبون في الرسائل المحمّلة ومسودة الحجز:</p><div className="flex flex-wrap gap-1.5">{phones.map(number => <Button key={number} type="button" size="sm" variant={phone === number ? "secondary" : "outline"} className="h-7" dir="ltr" onClick={() => void lookup(number)}>{number}</Button>)}</div></div>}
      {!phones.length && <p className="text-xs text-muted-foreground">لم يظهر رقم هاتف كامل في رسائل الزبون المحمّلة. يمكنك إدخاله أو تحميل الرسائل الأقدم.</p>}
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void lookup(phone); }}>
        <input aria-label="رقم الهاتف للبحث عن الطلب" inputMode="tel" dir="ltr" maxLength={50} value={phone} placeholder="07701234567" className="w-full min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm" onChange={event => { ++sequence.current; setPhone(event.target.value); setResult(null); setError(""); setLoading(false); }} />
        <Button type="submit" size="sm" disabled={loading || !phone.trim()}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}بحث</Button>
      </form>
      {loading && <p role="status" className="text-xs text-muted-foreground">جارٍ البحث عن الطلبات…</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {result && <div aria-label="نتائج بحث الطلبات" className="space-y-2">
        <p className="text-xs text-muted-foreground">{result.hasMore ? "أحدث 10 طلبات" : `${result.orders.length} طلب`} للرقم <bdi>{result.phoneNumber}</bdi></p>
        {!result.orders.length && <p role="status" className="text-sm">لا توجد طلبات مسجلة بهذا الرقم.</p>}
        {result.orders.map(order => <div key={order.id} className="rounded-lg border p-2.5 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2"><span dir="ltr" className="font-semibold">#{order.id.slice(0, 8)}</span><span className="rounded-full bg-muted px-2 py-1 font-semibold">{tStatus.has(order.status) ? tStatus(order.status) : order.status}</span>{order.isArchived && <span className="text-muted-foreground">مؤرشف</span>}</div>
          <p>{order.orderitems.map(item => `${item.name} × ${item.qty}`).join("، ") || "لا توجد أصناف مسجلة"}</p>
          <p className="text-muted-foreground">الباركود: {order.deliveryTrackingId ? <bdi className="font-medium text-foreground">{order.deliveryTrackingId}</bdi> : "لم يُسجّل بعد"}</p>
          <div className="flex flex-wrap justify-between gap-2 text-muted-foreground"><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString("ar-IQ")}</time><span>{tGov.has(order.governorate) ? tGov(order.governorate) : order.governorate}</span><span>{money(order.totalPrice)}</span></div>
          <Link href={inboxOrderLookupHref(locale, order, result.phoneNumber)} className="inline-flex items-center gap-1 underline">{order.isArchived ? "تفاصيل الطلب المؤرشف" : "تفاصيل الطلب"} <ExternalLink className="size-3" /></Link>
        </div>)}
      </div>}
    </PopoverContent>
  </Popover>;
}
