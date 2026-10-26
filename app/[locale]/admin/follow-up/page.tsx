import { requireStaff } from "@/lib/authorization";
import { getLocale } from "next-intl/server";
import { FOLLOW_UP_PAGE_SIZES, getFollowUpData, type FollowUpParams } from "@/lib/follow-up";
import { retryReturnMessage, saveReturnReason } from "@/lib/actions/follow-up.actions";
import { RETURN_REASONS, suggestReturnReason } from "@/lib/orders/return-reasons";
import { inboxOrderLookupHref } from "@/lib/meta/inbox-workflow";
import Link from "next/link";
import RefreshButton from "./refresh-button";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Inbox, Info, MessageCircle, PackageSearch, RefreshCw, Send, Truck } from "lucide-react";

export const metadata = { title: "متابعة الطلبات والرسائل" };

const messageLabels: Record<string, string> = {
  queued: "بانتظار الإرسال", sending: "جارٍ الإرسال", accepted: "قبلتها Meta",
  sent: "أُرسلت", delivered: "وصلت", read: "قُرئت", failed: "فشل الإرسال", review: "تحتاج مراجعة",
};
const orderLabels: Record<string, string> = {
  home: "الرئيسية", account: "حساب", pending: "معلق", rescheduled: "مؤجل",
  failed: "فشل التوصيل", returned: "راجع", returnReceived: "راجع مستلم",
  completed: "مكتمل", completedAccountant: "مكتمل محاسب",
};
const messageStyles: Record<string, string> = {
  queued: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  sending: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  accepted: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-300",
  sent: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  read: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/10 text-red-700 dark:text-red-300",
  review: "bg-orange-500/10 text-orange-800 dark:text-orange-300",
};
const dateLabel = (value: Date) => new Intl.DateTimeFormat("ar-IQ", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Baghdad",
}).format(value);
const countLabel = (value: number) => value.toLocaleString("ar-IQ");
const actionClass = "inline-flex items-center justify-center gap-2 rounded-[10px] border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function StatCard({ icon: Icon, label, detail, value, tone, href }: {
  icon: typeof Inbox; label: string; detail: string; value: number; tone: string; href: string;
}) {
  return (
    <Link href={href} className="group min-w-0 rounded-[10px] border bg-card p-4 transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-[10px] p-2 ${tone}`}><Icon className="h-4 w-4" /></span>
        <span className="text-2xl font-bold tabular-nums">{countLabel(value)}</span>
      </div>
      <p className="mt-3 text-sm font-bold">{label}</p>
      <p className="mt-1 flex items-center justify-between gap-2 text-xs leading-5 text-muted-foreground">
        {detail}<ArrowLeft className="h-3.5 w-3.5 shrink-0" />
      </p>
    </Link>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="px-4 py-9 text-center">
    <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-emerald-600 dark:text-emerald-400" />
    <p className="text-sm font-semibold">{title}</p>
    <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-muted-foreground">{children}</p>
  </div>;
}

function PageLinks({ count, size, page, href }: { count: number; size: number; page: number; href: (page: number) => string }) {
  if (count === 0) return null;
  return <nav aria-label="صفحات النتائج" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
    <span className="text-muted-foreground">عرض {countLabel((page - 1) * size + 1)}–{countLabel(Math.min(page * size, count))} من {countLabel(count)}</span>
    {count > size && <div className="flex gap-2">
      {page > 1 && <Link className={actionClass} href={href(page - 1)}>السابق</Link>}
      {page * size < count && <Link className={actionClass} href={href(page + 1)}>التالي</Link>}
    </div>}
  </nav>;
}

export default async function FollowUpPage({ searchParams }: { searchParams: Promise<FollowUpParams> }) {
  await requireStaff();
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const data = await getFollowUpData(params);
  const { outbox, returns, delayed, unread, needsReview, queued, reasonsCount, shipmentsCount, messageTotal, messageFilter } = data;
  const base = `/${locale}/admin/follow-up`;
  const chats = `/${locale}/admin/chats`;
  const pageHref = (changes: FollowUpParams, anchor: string) => {
    const query = new URLSearchParams({
      messages: messageFilter,
      reasonsPage: String(data.reasonsPage),
      shipmentsPage: String(data.shipmentsPage),
      messagePage: String(data.messagePage),
      ...changes,
    });
    return `${base}?${query.toString()}${anchor ? `#${anchor}` : ""}`;
  };
  const reviewHref = pageHref({ messages: "review", messagePage: "1" }, "message-outbox");
  const allMessagesHref = pageHref({ messages: "all", messagePage: "1" }, "message-outbox");
  return (
    <div dir="rtl" data-admin-wide data-admin-rounded className="min-w-0 w-full space-y-5 pb-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="rounded-[10px] border bg-card p-2.5"><Inbox className="h-5 w-5" /></span>
            <div><p className="text-xs text-muted-foreground">لوحة المتابعة اليومية</p><h1 className="mt-1 text-2xl font-bold">متابعة الطلبات والرسائل</h1></div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            ابدأ هنا لمعرفة ما يحتاج تدخلك بعد إرسال الطلب: رسالة تعثّر إرسالها، سبب رفض وصل من الزبون، أو شحنة طال انتظارها.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <RefreshButton />
          <Link href={chats} className={actionClass}><MessageCircle className="h-4 w-4" />كل محادثات واتساب</Link>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-[10px] border bg-muted/30 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 text-xs leading-6 text-muted-foreground">
          <p><strong className="text-foreground">فائدة هذه الصفحة:</strong> تجمع الحالات التي تستحق المتابعة لتفتح الطلب أو المحادثة مباشرة. إدارة الطلبات وتعديل حالاتها تتم في صفحة الطلبات، والرد على الزبون يتم في المحادثات.</p>
          <details className="mt-1">
            <summary className="w-fit cursor-pointer font-semibold text-foreground">كيف أستخدمها يومياً؟</summary>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>افتح الرسائل التي تحتاج مراجعة؛ افحص المحادثة قبل إعادة الإرسال.</li>
              <li>صنّف أسباب الرفض التي وصلت فعلاً من الزبائن لتحسين تقارير الراجع.</li>
              <li>راجع الشحنات التي مضى على إرسالها أكثر من خمسة أيام مع شركة التوصيل.</li>
            </ol>
          </details>
        </div>
      </div>

      <section aria-label="المتابعات المطلوبة" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard href={reviewHref} icon={Send} label="رسائل تحتاج مراجعة" detail="افحص المحادثة ثم قرّر إعادة الإرسال" value={needsReview} tone="bg-red-500/10 text-red-700 dark:text-red-300" />
        <StatCard href="#return-reasons" icon={AlertCircle} label="أسباب رفض بانتظار التصنيف" detail="احفظ سبب الرفض المناسب لكل رد" value={reasonsCount} tone="bg-orange-500/10 text-orange-800 dark:text-orange-300" />
        <StatCard href="#delayed-shipments" icon={Truck} label="شحنات تجاوزت 5 أيام" detail="تحقّق من مصيرها مع شركة التوصيل" value={shipmentsCount} tone="bg-purple-500/10 text-purple-700 dark:text-purple-300" />
        <StatCard href={`${chats}?filter=unread`} icon={MessageCircle} label="محادثات واتساب غير مقروءة" detail="افتح الرسائل واقرأ ردود الزبائن" value={unread} tone="bg-blue-500/10 text-blue-700 dark:text-blue-300" />
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <section id="message-outbox" aria-labelledby="message-outbox-title" className="min-w-0 scroll-mt-20 rounded-[10px] border bg-card">
          <div className="border-b p-4">
            <h2 id="message-outbox-title" className="flex items-center gap-2 text-base font-bold"><Send className="h-4 w-4" />متابعة إرسال قالب الراجع</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">هذه حالات إرسال قالب سؤال الزبون عن سبب الرفض. افتح المحادثة قبل إعادة المحاولة لتجنب تكرار الرسالة.</p>
            <nav aria-label="تصفية رسائل المتابعة" className="mt-3 flex flex-wrap gap-2">
              {([
                ["review", "تحتاج مراجعة", needsReview],
                ["pending", "قيد الإرسال", queued],
                ["all", "السجل الكامل", messageTotal],
              ] as const).map(([key, label, count]) => <Link key={key} aria-current={messageFilter === key ? "page" : undefined} href={pageHref({ messages: key, messagePage: "1" }, "message-outbox")} className={`${actionClass} ${messageFilter === key ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground"}`}>{label}<span className="tabular-nums">{countLabel(count)}</span></Link>)}
            </nav>
          </div>
          <div className="border-b bg-muted/20 px-4 py-2 text-[11px] leading-6 text-muted-foreground">«قبلتها Meta» تعني قبول طلب الإرسال. «وصلت» تعني وصول الرسالة، و«قُرئت» تعني وصول إشعار القراءة.</div>
          <div className="divide-y">
            {outbox.length === 0 && <EmptyState title={messageFilter === "review" ? "لا توجد رسائل تحتاج مراجعة" : messageFilter === "pending" ? "لا توجد رسائل قيد الإرسال" : "لا توجد رسائل مسجلة"}>
              {messageTotal > 0 ? <>يمكنك الاطلاع على بقية الحالات في <Link className="font-semibold underline underline-offset-4" href={allMessagesHref}>السجل الكامل</Link>.</> : "يظهر هنا سجل رسائل المتابعة التي يسجلها النظام؛ لا يعني خلوّه عدم وجود طلبات راجعة."}
            </EmptyState>}
            {outbox.map((entry) => <article className="space-y-3 p-4" key={entry.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="break-words text-sm font-bold">{entry.order.fullName}</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><bdi>#{entry.orderId.slice(0, 8)}</bdi> · {dateLabel(entry.createdAt)} · {entry.attempts} محاولة</p></div>
                <span className={`shrink-0 rounded-[10px] px-2.5 py-1 text-[11px] font-bold ${messageStyles[entry.status] ?? "bg-muted text-muted-foreground"}`}>{messageLabels[entry.status] ?? entry.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`${chats}?query=${encodeURIComponent(entry.order.phoneNumber)}`} className={actionClass}>فتح المحادثة</Link>
                <Link href={inboxOrderLookupHref(locale, entry.order)} className={actionClass}>فتح الطلب</Link>
                <bdi className="text-xs text-muted-foreground">{entry.order.phoneNumber}</bdi>
              </div>
              {entry.lastError && <p className="break-words rounded-[10px] bg-red-500/10 p-3 text-xs leading-6 text-red-700 dark:text-red-300">{entry.lastError}</p>}
              {["review", "failed"].includes(entry.status) && <form action={retryReturnMessage} className="rounded-[10px] border border-dashed p-3">
                <input type="hidden" name="id" value={entry.id} />
                <label className="flex items-start gap-2 text-xs leading-6"><input type="checkbox" name="reviewed" required className="mt-1.5" />راجعت المحادثة وأريد إعادة إرسال الرسالة</label>
                <button className={`${actionClass} mt-2`}><RefreshCw className="h-3.5 w-3.5" />إعادة المحاولة</button>
              </form>}
            </article>)}
          </div>
          <PageLinks count={data.filteredCount} size={FOLLOW_UP_PAGE_SIZES.messages} page={data.messagePage} href={(page) => pageHref({ messagePage: String(page) }, "message-outbox")} />
        </section>

        <section id="return-reasons" aria-labelledby="return-reasons-title" className="min-w-0 scroll-mt-20 rounded-[10px] border bg-card">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="return-reasons-title" className="flex items-center gap-2 text-base font-bold"><MessageCircle className="h-4 w-4" />تصنيف ردود أسباب الرفض</h2><span className="rounded-[10px] bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-800 dark:text-orange-300">{countLabel(reasonsCount)} بانتظار التصنيف</span></div>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">تظهر هنا الطلبات التي استُلم لها رد عن سبب الرفض ولم يُحفظ تصنيفه بعد. اقرأ رد الزبون، صحّح الاقتراح عند الحاجة، ثم احفظه.</p>
            <p className="mt-1 text-[11px] leading-6 text-muted-foreground">حفظ التصنيف يزيل الرد من هذه القائمة ولا يرسل رسالة أو يغيّر حالة الطلب.</p>
          </div>
          <div className="divide-y">
            {returns.length === 0 && <EmptyState title="لا توجد ردود بانتظار التصنيف">تظهر الردود هنا عند ربط رسالة الزبون بطلب راجع أو فشل توصيله. عددها يختلف عن إجمالي الطلبات الراجعة.</EmptyState>}
            {returns.map((order) => <article className="space-y-3 p-4" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="break-words text-sm font-bold">{order.fullName}</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><bdi>#{order.id.slice(0, 8)}</bdi> · {orderLabels[order.status] ?? order.status}<br />إنشاء الطلب: {dateLabel(order.createdAt)}</p></div>
                <div className="flex flex-wrap gap-2"><Link className={actionClass} href={inboxOrderLookupHref(locale, order)}>فتح الطلب</Link><Link className={actionClass} href={`${chats}?query=${encodeURIComponent(order.phoneNumber)}`}>محادثة واتساب</Link></div>
              </div>
              <blockquote className="whitespace-pre-wrap break-words rounded-[10px] border-s-2 border-primary/30 bg-muted/40 p-3 text-sm leading-7">{order.returnReasonText}</blockquote>
              <form action={saveReturnReason} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={order.id} />
                <label className="min-w-0 flex-1 basis-48 space-y-1.5 text-xs font-semibold"><span className="block">سبب الرفض — راجع التصنيف المقترح</span><select name="reason" className="h-10 w-full rounded-[10px] border bg-background px-3 text-sm font-normal" defaultValue={suggestReturnReason(order.returnReasonText ?? "")}>{Object.entries(RETURN_REASONS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <button className="h-10 rounded-[10px] bg-primary px-4 text-xs font-bold text-primary-foreground hover:opacity-90">حفظ التصنيف</button>
              </form>
            </article>)}
          </div>
          <PageLinks count={reasonsCount} size={FOLLOW_UP_PAGE_SIZES.reasons} page={data.reasonsPage} href={(page) => pageHref({ reasonsPage: String(page) }, "return-reasons")} />
        </section>
      </section>

      <section id="delayed-shipments" aria-labelledby="delayed-shipments-title" className="scroll-mt-20 rounded-[10px] border bg-card">
        <div className="border-b p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="delayed-shipments-title" className="flex items-center gap-2 text-base font-bold"><PackageSearch className="h-4 w-4" />شحنات تحتاج مراجعة</h2><span className="rounded-[10px] bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300">{countLabel(shipmentsCount)} شحنة</span></div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">مضى أكثر من خمسة أيام على إرسال هذه الطلبات، وحالتها الحالية: معلق، مؤجل، فشل التوصيل أو راجع. المدة محسوبة من الإرسال، ولا تعني أن الحالة لم تتغير خلالها.</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground"><strong className="text-foreground">الإجراء المطلوب:</strong> تحقّق من وضع الشحنة مع شركة التوصيل، ثم افتح الطلب لتحديثه عند الحاجة. تُعرض الأقدم إرسالاً أولاً.</p>
        </div>
        {delayed.length === 0 ? <EmptyState title="لا توجد شحنات تستدعي المراجعة ضمن هذه الشروط">تظهر هنا الشحنات بعد مرور خمسة أيام على الإرسال إذا كانت ما زالت بإحدى الحالات المذكورة.</EmptyState> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {delayed.map((order) => <article key={order.id} className="min-w-0 space-y-3 rounded-[10px] border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-bold">{order.fullName}</p><p className="mt-1 text-xs text-muted-foreground"><bdi>#{order.id.slice(0, 8)}</bdi> · {order.governorate}</p></div><span className="rounded-[10px] bg-muted px-2 py-1 text-[11px] font-semibold">{orderLabels[order.status] ?? order.status}</span></div>
            <dl className="space-y-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">رقم الهاتف</dt><dd><bdi>{order.phoneNumber}</bdi></dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">الباركود</dt><dd className="max-w-full break-all"><bdi>{order.deliveryTrackingId || "غير متوفر"}</bdi></dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">تاريخ الإرسال</dt><dd>{order.deliverySentAt ? dateLabel(order.deliverySentAt) : "—"}</dd></div></dl>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-800 dark:text-orange-300"><Clock3 className="h-3.5 w-3.5" />{order.deliverySentAt ? countLabel(Math.floor((data.now.getTime() - order.deliverySentAt.getTime()) / 86400000)) : "—"} يوم منذ الإرسال</span><Link className={actionClass} href={inboxOrderLookupHref(locale, order)}>مراجعة الطلب<ArrowLeft className="h-3.5 w-3.5" /></Link></div>
          </article>)}
        </div>}
        <PageLinks count={shipmentsCount} size={FOLLOW_UP_PAGE_SIZES.shipments} page={data.shipmentsPage} href={(page) => pageHref({ shipmentsPage: String(page) }, "delayed-shipments")} />
      </section>
      <p className="text-xs leading-6 text-muted-foreground">الأعداد تشمل كل النتائج المطابقة، مع تقسيم القوائم إلى صفحات. آخر تحميل: {dateLabel(data.now)}. زر تحديث البيانات يعيد قراءة السجلات المحفوظة؛ لا يجلب تحديثاً من شركة التوصيل.</p>
    </div>
  );
}

