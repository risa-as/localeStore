"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, Loader2, Package, Plus, RotateCcw, Search, Settings2, Square, X, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchSocialInboxProducts } from "@/lib/actions/social-inbox.actions";
import { expandCommentReply, MAX_COMMENT_REPLIES, replyVariants, restoreDefaultReplies, type CommentReply } from "@/lib/meta/comment-replies";
import { COMMENT_INTENTS, type CommentIntent } from "@/lib/meta/comment-intent";
import { money, type InboxProduct } from "@/lib/meta/inbox-tools";
import type { InboxItem } from "@/lib/meta/inbox";
import type { CommentReplyLibrary } from "./use-social-comment-replies";

export type BulkState = { label: string; total: number; done: number; sent: number; skipped: number; running: boolean; result?: string };
export type BulkGroup = { reply: CommentReply; items: InboxItem[] };

const FIELDS = ["الاسم", "المنتج", "السعر", "التوصيل", "السعر مع التوصيل", "العروض", "الرابط"];
export const BULK_LIMIT = 30;

export default function SocialInboxCommentToolbar({ library, product, productSource, productLoading, productError, onChooseProduct,
  groups, bulk, disabled, onStartBulk, onCancelBulk }: {
  library: CommentReplyLibrary; product: InboxProduct | null; productSource: "manual" | "auto" | null;
  productLoading: boolean; productError: string; onChooseProduct: (product: InboxProduct | null) => void;
  groups: BulkGroup[]; bulk: BulkState | null; disabled: boolean;
  onStartBulk: (reply: CommentReply, items: InboxItem[]) => void; onCancelBulk: () => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirm, setConfirm] = useState<BulkGroup | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const chosen = confirm ? confirm.items.filter(item => !excluded.has(item.id)).slice(0, BULK_LIMIT) : [];
  const preview = chosen.length && confirm ? expandCommentReply(confirm.reply, chosen[0].title, product, 0) : null;
  const ordersWarning = !!confirm?.reply.intents.includes("order");

  return <div className="rounded-lg border bg-background p-2 space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Package className="size-4 text-muted-foreground" />
      <span className="font-semibold">منتج المنشور:</span>
      {productLoading ? <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" />جارٍ التحديد…</span>
        : product ? <span>{product.name} · {money(product.price)} <span className="text-muted-foreground">({productSource === "manual" ? "اخترته أنت" : "من المنشور"})</span></span>
        : <span className="text-amber-700 dark:text-amber-400">غير محدد — اختر المنتج لتُملأ السعر والرابط في الردود</span>}
      <ProductPicker disabled={disabled} onPick={onChooseProduct} />
      {productSource === "manual" && <Button size="sm" variant="ghost" className="h-7 px-2" disabled={disabled} onClick={() => onChooseProduct(null)}>إلغاء الاختيار</Button>}
      <Button size="sm" variant="ghost" className="h-7 ms-auto gap-1" disabled={!library.loaded} onClick={() => setEditorOpen(true)}><Settings2 className="size-3.5" />تخصيص الردود</Button>
    </div>
    {productError && <p role="alert" className="text-[11px] text-destructive">{productError}</p>}

    {bulk ? <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1" role="status">
      <div className="flex items-center gap-2">
        {bulk.running && <Loader2 className="size-3.5 animate-spin" />}
        <span className="font-semibold">رد جماعي «{bulk.label}»: {bulk.done}/{bulk.total}</span>
        <span className="text-muted-foreground">أُرسل {bulk.sent} · تُخطّي {bulk.skipped}</span>
        {bulk.running && <Button size="sm" variant="outline" className="h-6 ms-auto gap-1" onClick={onCancelBulk}><Square className="size-3" />إيقاف</Button>}
      </div>
      {bulk.result && <p>{bulk.result}</p>}
    </div> : groups.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Zap className="size-3.5 text-primary" /><span className="font-semibold">رد جماعي حسب الكلمات:</span>
      {groups.map(group => <Button key={group.reply.id} size="sm" variant="outline" className="h-7" disabled={disabled} onClick={() => { setExcluded(new Set()); setConfirm(group); }}>
        {group.reply.label} ({group.items.length})
      </Button>)}
    </div>}

    <Dialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>الرد على {chosen.length} تعليقاً بـ «{confirm?.reply.label}»؟</DialogTitle>
          <DialogDescription>
            التعليقات المحمّلة التي لم تُرد عليها الصفحة. أزل علامة أي تعليق لا تريد الرد عليه. يُرسل تعليقاً كل بضع ثوانٍ ({BULK_LIMIT} كحد أقصى في كل مرة)، ويتوقف فوراً إذا اعترضت Meta، ويمكنك إيقافه في أي وقت.
            {confirm && replyVariants(confirm.reply.publicText).length > 1 ? ` يتناوب بين ${replyVariants(confirm.reply.publicText).length} صيغ للرد العلني.` : ""}
          </DialogDescription>
        </DialogHeader>
        {ordersWarning && <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />هذه تعليقات فيها أرقام هواتف. تأكد أنك سجّلت طلباتهم في المتجر قبل أن تخبرهم بأن الطلب وصل.
        </p>}
        {confirm && <div className="max-h-52 overflow-auto rounded-md border divide-y">{confirm.items.map((item, index) => <label key={item.id}
          className={`flex items-start gap-2 p-2 text-xs ${index >= BULK_LIMIT ? "opacity-50" : ""}`}>
          <Checkbox checked={!excluded.has(item.id)} onCheckedChange={value => setExcluded(prev => {
            const next = new Set(prev); if (value === true) next.delete(item.id); else next.add(item.id); return next; })} />
          <span className="min-w-0"><span className="font-semibold">{item.title}</span>: <span dir="auto">{item.text}</span></span>
        </label>)}</div>}
        {confirm && confirm.items.length - excluded.size > BULK_LIMIT && <p className="text-[11px] text-muted-foreground">سيُرد على أول {BULK_LIMIT}؛ شغّله مرة أخرى للباقي.</p>}
        {preview && (preview.missing.length
          ? <p role="alert" className="text-sm text-destructive">لا يمكن الإرسال: الرد يحتاج {preview.missing.join("، ")}. اختر منتج المنشور أولاً.</p>
          : <div className="space-y-2 text-sm">
            {preview.privateText && <div><p className="text-xs font-semibold mb-1">رسالة خاصة (تُرسل أولاً):</p><p dir="auto" className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2">{preview.privateText}</p></div>}
            {preview.publicText && <div><p className="text-xs font-semibold mb-1">رد علني:</p><p dir="auto" className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2">{preview.publicText}</p></div>}
            <p className="text-[11px] text-muted-foreground">معاينة أول تعليق ({chosen[0]?.title}). يتغير الاسم والصيغة لكل زبون.</p>
          </div>)}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setConfirm(null)}>إلغاء</Button>
          <Button disabled={!preview || preview.missing.length > 0} onClick={() => { if (confirm) onStartBulk(confirm.reply, chosen); setConfirm(null); }}>ابدأ الرد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ReplyEditor open={editorOpen} onOpenChange={setEditorOpen} library={library} />
  </div>;
}

function ProductPicker({ disabled, onPick }: { disabled: boolean; onPick: (product: InboxProduct) => void }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InboxProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const current = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await searchSocialInboxProducts(query, locale);
        if (current !== seq.current) return;
        if (result.ok) setItems(result.data); else { setItems([]); setError(result.message); }
      } catch { if (current === seq.current) setError("تعذر البحث عن المنتجات"); }
      finally { if (current === seq.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query, locale]);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button size="sm" variant="outline" className="h-7 px-2" disabled={disabled}>تغيير</Button></PopoverTrigger>
    <PopoverContent dir="rtl" align="start" className="w-72 p-2 space-y-2">
      <div className="relative"><Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
        <input autoFocus aria-label="البحث عن منتج المنشور" maxLength={120} placeholder="اسم المنتج…" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-md border bg-background py-2 ps-8 pe-2 text-sm" /></div>
      {loading ? <p className="text-xs flex items-center gap-1"><Loader2 className="size-3 animate-spin" />بحث…</p>
        : error ? <p role="alert" className="text-xs text-destructive">{error}</p>
        : <div className="max-h-64 overflow-auto space-y-1">{items.map(item => <button key={item.id} className="block w-full rounded-md border p-2 text-start hover:bg-muted" onClick={() => { onPick(item); setOpen(false); }}>
          <span className="block text-xs font-medium line-clamp-2">{item.name}</span>
          <span className="block text-[11px] text-muted-foreground">{money(item.price)}</span>
        </button>)}{!items.length && <p className="text-xs text-muted-foreground">لا منتجات مطابقة.</p>}</div>}
    </PopoverContent>
  </Popover>;
}

const blank = (): CommentReply => ({ id: crypto.randomUUID(), label: "", keywords: [], intents: [], publicText: "", privateText: "" });
const intentLabel = (intent: CommentIntent) => COMMENT_INTENTS.find(item => item.value === intent)?.label ?? intent;

function ReplyEditor({ open, onOpenChange, library }: { open: boolean; onOpenChange: (open: boolean) => void; library: CommentReplyLibrary }) {
  const { replies } = library;
  const [edit, setEdit] = useState<(CommentReply & { keywordText: string }) | null>(null);
  const [feedback, setFeedback] = useState("");
  const persist = (next: CommentReply[]) => {
    const saved = library.save(next);
    setFeedback(saved ? "حُفظت الردود." : "تعذر الحفظ في المتصفح؛ تحقق من إعدادات التخزين.");
    return saved;
  };
  const start = (reply: CommentReply) => setEdit({ ...reply, keywordText: reply.keywords.join("، ") });
  const move = (index: number, delta: number) => {
    const next = [...replies];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    persist(next);
  };
  const addField = (target: "publicText" | "privateText", field: string) => {
    if (!edit) return;
    const text = edit[target];
    setEdit({ ...edit, [target]: `${text}${text && !/\s$/.test(text) ? " " : ""}{${field}}` });
  };

  return <Dialog open={open} onOpenChange={value => { onOpenChange(value); if (!value) { setEdit(null); setFeedback(""); } }}>
    <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[90dvh] overflow-auto">
      <DialogHeader>
        <DialogTitle>ردود التعليقات</DialogTitle>
        <DialogDescription>
          كل رد يظهر زراً تحت كل تعليق. إذا أضفت كلمات مفتاحية يُقترح الرد تلقائياً للتعليقات التي تحتويها ويمكن إرساله جماعياً.
          وإذا كتبت رسالة خاصة تُرسل للزبون أولاً ثم يُنشر الرد العلني. تُحفظ في هذا المتصفح لحسابك (حتى {MAX_COMMENT_REPLIES} رداً).
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">{replies.map((reply, index) => <div key={reply.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{reply.label}{reply.privateText.trim() && <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">+ رسالة خاصة</span>}</p>
          <p className="text-[11px] text-muted-foreground truncate">{[
            reply.intents.length ? `يُقترح لـ: ${reply.intents.map(intentLabel).join("، ")}` : "",
            reply.keywords.length ? `الكلمات: ${reply.keywords.join("، ")}` : "",
          ].filter(Boolean).join(" · ") || "زر فقط"}</p>
        </div>
        <Button size="sm" variant="ghost" className="px-2" disabled={index === 0} aria-label="تقديم" onClick={() => move(index, -1)}>↑</Button>
        <Button size="sm" variant="ghost" className="px-2" disabled={index === replies.length - 1} aria-label="تأخير" onClick={() => move(index, 1)}>↓</Button>
        <Button size="sm" variant="outline" onClick={() => start(reply)}>تعديل</Button>
        <Button size="sm" variant="ghost" aria-label={`حذف ${reply.label}`} onClick={() => { if (persist(replies.filter(item => item.id !== reply.id)) && edit?.id === reply.id) setEdit(null); }}><X className="size-4" /></Button>
      </div>)}</div>
      <p className="text-[11px] text-muted-foreground">الترتيب مهم: عند تطابق أكثر من رد مع تعليق يُقترح الأعلى.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="w-fit" disabled={replies.length >= MAX_COMMENT_REPLIES} onClick={() => start(blank())}><Plus className="size-4 me-2" />رد جديد</Button>
        <Button type="button" variant="ghost" className="w-fit" onClick={() => { if (persist(restoreDefaultReplies(replies))) setEdit(null); }}><RotateCcw className="size-4 me-2" />استعادة الردود المقترحة</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">«استعادة الردود المقترحة» تعيد الردود الجاهزة (المكتوبة من تعليقات زبائنك الفعلية) وتُبقي ردودك الخاصة.</p>

      {edit && <form className="space-y-3 border-t pt-3" onSubmit={event => {
        event.preventDefault();
        const keywords = [...new Set(edit.keywordText.split(/[,،\n]/).map(word => word.trim()).filter(Boolean))].slice(0, 30);
        const candidate: CommentReply = { id: edit.id, label: edit.label.trim(), keywords, intents: edit.intents, publicText: edit.publicText.trim(), privateText: edit.privateText.trim() };
        if (!candidate.label) { setFeedback("اكتب اسماً للزر."); return; }
        if (!candidate.publicText && !candidate.privateText) { setFeedback("اكتب رداً علنياً أو رسالة خاصة على الأقل."); return; }
        if (replyVariants(candidate.publicText).some(variant => variant.length > 1000)) { setFeedback("كل صيغة للرد العلني يجب ألا تتجاوز 1000 حرف."); return; }
        if (keywords.some(word => word.length > 40)) { setFeedback("الكلمة المفتاحية لا تتجاوز 40 حرفاً."); return; }
        const next = replies.some(item => item.id === candidate.id) ? replies.map(item => item.id === candidate.id ? candidate : item) : [...replies, candidate];
        if (persist(next)) setEdit(null);
      }}>
        <label className="block text-sm">اسم الزر<input required maxLength={40} value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} className="mt-1 w-full rounded-md border p-2 bg-background" /></label>
        <fieldset className="space-y-1">
          <legend className="text-sm">يُقترح تلقائياً لهذه التعليقات <span className="text-xs text-muted-foreground">(ويُرسل لها في الرد الجماعي)</span></legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">{COMMENT_INTENTS.map(intent => <label key={intent.value} className="flex items-center gap-1.5 text-xs" title={intent.hint}>
            <Checkbox checked={edit.intents.includes(intent.value)} onCheckedChange={value => setEdit({ ...edit,
              intents: value === true ? [...edit.intents, intent.value] : edit.intents.filter(item => item !== intent.value) })} />
            {intent.label}
          </label>)}</div>
        </fieldset>
        <label className="block text-sm">كلمات مفتاحية إضافية <span className="text-xs text-muted-foreground">(افصل بينها بفاصلة — اختياري)</span>
          <input maxLength={600} placeholder="سعر، بكم، شكد" value={edit.keywordText} onChange={e => setEdit({ ...edit, keywordText: e.target.value })} className="mt-1 w-full rounded-md border p-2 bg-background" />
          <span className="block text-[11px] text-muted-foreground mt-1">تُطابق مع اختلاف الهمزات والتاء المربوطة والتشكيل والحروف الفارسية (ی، ک).</span></label>
        <div className="space-y-1">
          <label className="block text-sm">الرد العلني تحت التعليق<Textarea maxLength={3000} rows={4} value={edit.publicText} onChange={e => setEdit({ ...edit, publicText: e.target.value })} /></label>
          <p className="text-[11px] text-muted-foreground">لعدة صيغ ضع سطراً فيه --- فقط بين كل صيغة؛ يتناوب بينها الرد الجماعي حتى لا تتكرر الرسالة نفسها.</p>
          <FieldButtons onAdd={field => addField("publicText", field)} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm">رسالة خاصة للزبون <span className="text-xs text-muted-foreground">(اختياري — تُرسل أولاً، مرة واحدة لكل تعليق خلال 7 أيام)</span><Textarea maxLength={1000} rows={4} value={edit.privateText} onChange={e => setEdit({ ...edit, privateText: e.target.value })} /></label>
          <FieldButtons onAdd={field => addField("privateText", field)} />
        </div>
        <p className="text-[11px] text-muted-foreground">{"{المنتج} {السعر} {التوصيل} {السعر مع التوصيل} {العروض} {الرابط}"} تُملأ من منتج المنشور ({"{العروض}"} من حقل العروض في المنتج، ويُحذف السطر إن كان فارغاً).</p>
        <div className="flex gap-2"><Button type="submit">حفظ الرد</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
      </form>}
      {feedback && <p role="status" className="text-xs">{feedback}</p>}
    </DialogContent>
  </Dialog>;
}

function FieldButtons({ onAdd }: { onAdd: (field: string) => void }) {
  return <div className="flex flex-wrap gap-1 items-center"><span className="text-[11px] text-muted-foreground">إضافة:</span>
    {FIELDS.map(field => <Button key={field} type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => onAdd(field)}>{`{${field}}`}</Button>)}</div>;
}
