"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { searchSocialInboxProducts } from "@/lib/actions/social-inbox.actions";
import { expandQuickReply, quickReplyProductFields, groupQuickReplies, money, type InboxProduct, type QuickReply } from "@/lib/meta/inbox-tools";
import type { QuickReplyLibrary } from "./use-social-quick-replies";
import { ExternalLink, Loader2, Plus, Search, X } from "lucide-react";

export default function SocialInboxTools({ library, name, draft, disabled, onDraft, onInserted, onProductSelected }: {
  library: QuickReplyLibrary; name: string; draft: string; disabled: boolean; onDraft: (text: string) => void; onInserted: () => void; onProductSelected?: (product: InboxProduct | null) => void;
}) {
  const locale = useLocale();
  const { templates, loaded } = library;
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<InboxProduct[]>([]);
  const [product, setProduct] = useState<InboxProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [edit, setEdit] = useState<QuickReply | null>(null);
  const [open, setOpen] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const seq = ++sequence.current;
    let cancelled = false;
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const result = await searchSocialInboxProducts(query, locale);
        if (cancelled || seq !== sequence.current) return;
        if (result.ok) setProducts(result.data); else { setError(result.message); setProducts([]); }
      } catch { if (!cancelled && seq === sequence.current) setError("تعذر البحث عن المنتجات"); }
      finally { if (!cancelled && seq === sequence.current) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, locale]);

  function persist(next: QuickReply[]) {
    const saved = library.save(next);
    setFeedback(saved ? "حُفظت الردود وتحدّثت الأزرار فوق مربع الكتابة." : "تعذر الحفظ في المتصفح؛ تحقق من إعدادات التخزين.");
    return saved;
  }
  function insert(text: string, replace = false) {
    const next = replace || !draft.trim() ? text : `${draft.trimEnd()}\n${text}`;
    if (next.length > 1000) { setFeedback("النص يتجاوز 1000 حرف؛ اختصر المسودة قبل الإضافة."); return; }
    onDraft(next); setFeedback("أُضيف إلى المسودة؛ راجعه ثم أرسله.");
    onInserted();
  }
  function apply(template: QuickReply) {
    const result = expandQuickReply(template.text, name, product);
    if (result.missing.length) {
      const productFields = quickReplyProductFields(template.text);
      const unknown = result.missing.filter(field => !productFields.includes(field));
      setFeedback(unknown.length ? `متغيرات غير معروفة في هذا الرد: ${unknown.join("، ")}. عدّل نصه من إدارة الردود.`
        : `هذا الرد يتضمن ${result.missing.join("، ")}؛ اختر منتجاً لتعبئتها. الردود العامة تعمل دون منتج.`);
      return;
    }
    insert(result.text, /^\/\S*$/.test(draft.trim()));
  }
  const slash = draft.trim().match(/^\/(\S*)$/)?.[1];
  const options = slash === undefined ? templates : templates.filter(item => item.shortcut.includes(slash) || item.title.includes(slash));
  const { general: generalOptions, product: productOptions } = groupQuickReplies(options);
  return <aside className="rounded-xl border bg-card min-w-0 overflow-auto xl:h-full" aria-label="أدوات الرد السريع">
    <div className="p-3 border-b flex items-center justify-between"><h3 className="text-sm font-semibold">أدوات الرد</h3>
      <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="ghost" disabled={!loaded}>إدارة الردود</Button></DialogTrigger>
        <DialogContent dir="rtl" className="max-h-[85dvh] overflow-auto"><DialogHeader><DialogTitle>الردود الجاهزة</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">تُحفظ في هذا المتصفح لحسابك، وتظهر تعديلات العنوان والنص فوراً في أزرار الرد. حتى 50 رداً.</p>
          <p className="text-xs text-muted-foreground">التصنيف تلقائي: النص العادي و{'{الاسم}'} رد عام. إضافة {'{المنتج} أو {السعر} أو {التوصيل} أو {التوفر} أو {الرابط}'} تجعله رداً خاصاً بالمنتج.</p>
          <div className="space-y-2">{templates.map(item => <div key={item.id} className="flex items-center gap-2 border rounded-md p-2"><span className="flex-1 text-sm">{item.title} <bdi className="text-xs text-muted-foreground">/{item.shortcut}</bdi></span>
            <Button size="sm" variant="outline" onClick={() => setEdit({ ...item })}>تعديل</Button><Button size="sm" variant="ghost" aria-label={`حذف ${item.title}`} onClick={() => { if (persist(templates.filter(x => x.id !== item.id))) setEdit(null); }}><X className="size-4" /></Button></div>)}</div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={templates.length >= 50} onClick={() => setEdit({ id: crypto.randomUUID(), title: "", shortcut: "", text: "" })}><Plus className="size-4 me-2" />رد عام جديد</Button>
            <Button type="button" variant="outline" disabled={templates.length >= 50} onClick={() => setEdit({ id: crypto.randomUUID(), title: "", shortcut: "", text: "أهلاً {الاسم}، سعر {المنتج} هو {السعر}.\n{الرابط}" })}><Plus className="size-4 me-2" />رد منتج جديد</Button></div>
          {edit && <form className="space-y-3 border-t pt-3" onSubmit={event => {
            event.preventDefault();
            const candidate = { ...edit, title: edit.title.trim(), shortcut: edit.shortcut.trim().replace(/^\//, ""), text: edit.text.trim() };
            if (!candidate.title || !candidate.text || !/^\S{1,30}$/.test(candidate.shortcut)) { setFeedback("أكمل العنوان والنص واختصاراً بلا مسافات."); return; }
            if (templates.some(item => item.id !== candidate.id && item.shortcut === candidate.shortcut)) { setFeedback("هذا الاختصار مستخدم؛ اختر اختصاراً آخر."); return; }
            const next = templates.some(item => item.id === candidate.id) ? templates.map(item => item.id === candidate.id ? candidate : item) : [...templates, candidate];
            if (persist(next)) setEdit(null);
          }}>
            <label className="block text-sm">عنوان الرد<input required maxLength={60} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} className="mt-1 w-full rounded-md border p-2 bg-background" /></label>
            <label className="block text-sm">الاختصار بدون /<input required maxLength={30} value={edit.shortcut} onChange={e => setEdit({ ...edit, shortcut: e.target.value })} className="mt-1 w-full rounded-md border p-2 bg-background" /></label>
            <label className="block text-sm">نص الرد<Textarea required maxLength={1000} rows={4} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} /></label>
            <div className="flex flex-wrap gap-1 items-center"><span className="text-xs text-muted-foreground">إضافة متغير:</span>{["الاسم", "المنتج", "السعر", "التوصيل", "التوفر", "الرابط"].map(field => <Button key={field} type="button" size="sm" variant="outline" disabled={edit.text.length + field.length + 3 > 1000} onClick={() => setEdit({ ...edit, text: `${edit.text}${edit.text && !/\s$/.test(edit.text) ? " " : ""}{${field}}` })}>{`{${field}}`}</Button>)}</div>
            <p role="status" className="text-xs font-medium">{quickReplyProductFields(edit.text).length ? "رد خاص بالمنتج — يحتاج اختيار منتج عند الاستخدام." : "رد عام — سيظهر فوق مربع الكتابة ويعمل دون اختيار منتج."}</p>
            <Button type="submit">حفظ الرد</Button>
          </form>}
          {feedback && <p role="status" className="text-xs">{feedback}</p>}
        </DialogContent>
      </Dialog>
    </div>
    <div className="p-3 space-y-2 border-b"><p className="text-xs text-muted-foreground">اكتب / في المسودة أو اختر رداً لإدراجه.</p>
      {!!generalOptions.length && <div className="space-y-1"><h4 className="text-xs font-medium">ردود عامة · دون منتج</h4><div className="flex flex-wrap gap-1.5">{generalOptions.map(item => <Button key={item.id} type="button" size="sm" variant="outline" disabled={disabled} title={`/${item.shortcut}\n${item.text}`} onClick={() => apply(item)}>{item.title}</Button>)}</div></div>}
      {!!productOptions.length && <div className="space-y-1"><h4 className="text-xs font-medium">ردود تتضمن معلومات منتج</h4><div className="flex flex-wrap gap-1.5">{productOptions.map(item => <Button key={item.id} type="button" size="sm" variant="outline" disabled={disabled} title={`/${item.shortcut}\n${item.text}`} onClick={() => apply(item)}>{item.title}</Button>)}</div></div>}
      {!options.length && <p className="text-xs text-muted-foreground">لا رد يطابق هذا الاختصار.</p>}
      {feedback && <p role="status" className="text-xs text-primary">{feedback}</p>}
    </div>
    <div className="p-3 space-y-3"><h3 className="text-sm font-semibold">معلومات المنتج <span className="font-normal text-xs text-muted-foreground">(اختياري للردود العامة)</span></h3>
      <div className="relative"><Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" /><input aria-label="البحث عن منتج للرد" maxLength={120} placeholder="اسم المنتج…" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-md border bg-background py-2 ps-8 pe-2 text-sm" /></div>
      {product && <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 space-y-2">
        <div className="flex justify-between gap-2"><span className="text-sm font-medium">{product.name}</span><button aria-label="إلغاء اختيار المنتج" onClick={() => { setProduct(null); onProductSelected?.(null); }}><X className="size-4" /></button></div>
        <p className="text-xs">{money(product.price)} · {product.available > 0 ? `المتاح ${product.available}` : "غير متوفر"}</p>
        <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={disabled} onClick={() => insert(`${product.name}\nالسعر: ${money(product.price)}\nالتوصيل: ${product.shippingPrice === 0 ? "مجاني" : money(product.shippingPrice)}\n${product.available > 0 ? "متوفر حالياً" : "غير متوفر حالياً"}\n${product.url}`)}>إدراج التفاصيل</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => insert(product.url)}>الرابط</Button>
          {product.image && <Button size="sm" variant="outline" disabled={disabled} onClick={() => insert(new URL(product.image!, product.url).toString())}>رابط الصورة</Button>}</div>
      </div>}
      {loading ? <p role="status" className="text-xs flex items-center gap-2"><Loader2 className="size-3 animate-spin" />بحث…</p> : error ? <p role="alert" className="text-xs text-destructive">{error}</p> : <div className="max-h-64 xl:max-h-none overflow-auto space-y-1">{products.map(item => <div key={item.id} className={`flex gap-2 items-center rounded-md border p-2 ${product?.id === item.id ? "border-primary" : ""}`}>
        <button className="flex flex-1 min-w-0 gap-2 items-center text-start" aria-pressed={product?.id === item.id} onClick={() => { setProduct(item); onProductSelected?.(item); setFeedback(""); }}>
          {item.image && <Image unoptimized src={item.image} alt="" width={40} height={40} className="size-10 object-cover rounded" />}
          <span className="min-w-0"><span className="block text-xs font-medium line-clamp-2">{item.name}</span><span className="block text-[11px] text-muted-foreground">{money(item.price)} · {item.available > 0 ? `متاح ${item.available}` : "نفد"}</span></span>
        </button><a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`فتح ${item.name}`}><ExternalLink className="size-3 text-muted-foreground" /></a>
      </div>)}{!products.length && <p className="text-xs text-muted-foreground">لا منتجات مطابقة.</p>}</div>}
      <p className="text-[11px] text-muted-foreground">حتى 20 منتجاً لكل بحث. الكمية تشمل خصم الحجوزات النشطة؛ السعر المعروض للقطعة.</p>
    </div>
  </aside>;
}
