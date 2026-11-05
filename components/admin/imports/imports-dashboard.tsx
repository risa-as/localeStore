"use client";
import { AppSelect } from "@/components/ui/app-select";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Clock, Loader2, PackagePlus, PackageSearch, RotateCcw, Trash2, Wallet, TrendingUp, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  deleteImportCandidate,
  getReorderAlerts,
  setImportCandidateStatus,
  type CandidateDTO,
  type ReorderAlert,
  type ReorderAlertsReport,
} from "@/lib/actions/import.actions";
import {
  COMMITTED_STATUSES,
  IMPORT_STATUSES,
  IMPORT_STATUS_LABELS,
  MANUAL_STATUSES,
  type ImportStatus,
} from "@/lib/import-status";
import { cn } from "@/lib/utils";
import { SIGNAL_STYLES, STATUS_DOTS, STATUS_STYLES, fmtK, fmtNum, fmtPct, profitTone } from "./format";

type Filter = "active" | "all" | ImportStatus;
type Sort = "newest" | "margin" | "roi" | "profit";

/** الملتزم يُعرض بلقطته الثابتة، وغيره بالحساب الحي. */
function shown(c: CandidateDTO) {
  return COMMITTED_STATUSES.includes(c.status) && c.snapshot
    ? { result: c.snapshot.result, signal: c.snapshot.signal, frozen: true }
    : { result: c.result, signal: c.signal, frozen: false };
}

function Stat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ElementType; tone?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className={cn("text-xl font-bold tracking-tight", tone)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function ImportsDashboard({
  candidates,
  settingsVersion,
}: {
  candidates: CandidateDTO[];
  /** يتغير مع الإعدادات فتُعاد حسابات التنبيهات. */
  settingsVersion: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<Sort>("newest");
  const [showExcluded, setShowExcluded] = useState(false);

  // التنبيهات تحتاج أرقام صفحة الأرباح لفترة طويلة (ثوانٍ في أول مرة)، فتُحمَّل
  // بعد ظهور الصفحة حتى لا تتأخر بقية اللوحة.
  // النتيجة مربوطة بنسخة الإعدادات التي حُسبت بها، فتغيير الإعدادات يعيد
  // حالة «جارٍ الحساب» تلقائياً دون تصفير الحالة داخل المؤثر.
  const [loaded, setLoaded] = useState<{ version: string; data: ReorderAlertsReport | null; error: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    getReorderAlerts()
      .then((data) => {
        if (alive) setLoaded({ version: settingsVersion, data, error: false });
      })
      .catch(() => {
        if (alive) setLoaded({ version: settingsVersion, data: null, error: true });
      });
    return () => {
      alive = false;
    };
  }, [settingsVersion]);
  const current = loaded?.version === settingsVersion ? loaded : null;
  const reorder = current?.data ?? null;
  const reorderError = current?.error ?? false;
  const alerts = reorder?.alerts ?? [];
  const warnings = reorder?.warnings ?? [];

  const committed = candidates.filter((c) => COMMITTED_STATUSES.includes(c.status));
  const capital = committed.reduce((s, c) => s + shown(c).result.capitalKiqd, 0);
  const expectedProfit = committed.reduce((s, c) => s + shown(c).result.totalProfitKiqd, 0);
  const studying = candidates.filter((c) => c.status === "studying").length;
  const urgent = alerts.filter((a) => a.orderNow).length;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [candidates]);

  const rows = useMemo(() => {
    const list = candidates.filter((c) =>
      filter === "all" ? true : filter === "active" ? c.status !== "converted" && c.status !== "rejected" : c.status === filter,
    );
    const key = (c: CandidateDTO) => {
      const r = shown(c).result;
      return sort === "margin" ? r.marginPct : sort === "roi" ? r.roiPct : sort === "profit" ? r.totalProfitKiqd : new Date(c.createdAt).getTime();
    };
    return [...list].sort((a, b) => key(b) - key(a));
  }, [candidates, filter, sort]);

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "active", label: "النشطة", count: candidates.filter((c) => c.status !== "converted" && c.status !== "rejected").length },
    { key: "all", label: "الكل", count: candidates.length },
    ...IMPORT_STATUSES.map((s) => ({ key: s as Filter, label: IMPORT_STATUS_LABELS[s], count: counts.get(s) ?? 0 })).filter((c) => c.count > 0),
  ];

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {w.text}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="رأس المال الملتزم" value={fmtK(capital)} sub={`${committed.length} منتج مطلوب أو وصل`} icon={Wallet} />
        <Stat label="الربح المتوقع للملتزم" value={fmtK(expectedProfit)} sub="لو بيعت الكمية كاملة" icon={TrendingUp} tone={profitTone(expectedProfit)} />
        <Stat label="قيد الدراسة" value={String(studying)} sub="منتجات تُدرس قبل طلبها" icon={PackageSearch} />
        <Stat
          label="يجب طلبها الآن"
          value={reorder ? String(urgent) : "…"}
          sub={reorder ? `مربحة (هامش ≥ ${reorder.targetMarginPct}٪) وستنفد قبل وصول شحنة` : "جارٍ الحساب…"}
          icon={Timer}
          tone={urgent > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <RotateCcw className="h-4 w-4" />
            تنبيهات إعادة الطلب
          </h2>
          {reorder && (
            <p className="text-xs text-muted-foreground">
              تنفد خلال {reorder.horizonDays} يوماً (مدة الشحن + أسبوعان) · {reorder.minHistoryOrders} طلب على الأقل · هامش ≥ {reorder.targetMarginPct}٪ · آخر {reorder.windowDays} يوماً
            </p>
          )}
        </div>
        {reorderError ? (
          <p className="text-sm text-red-600">تعذّر حساب التنبيهات.</p>
        ) : !reorder ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ حساب المبيعات والأرباح الفعلية…
          </p>
        ) : (
          <>
            {reorder.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا يوجد منتج يحقق الشروط وسينفد خلال {reorder.horizonDays} يوماً. منتجاتك الأكثر مبيعاً مخزونها يكفي أطول من ذلك.
              </p>
            ) : (
              <AlertsTable rows={reorder.alerts} />
            )}
            {reorder.excluded.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setShowExcluded((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showExcluded && "rotate-180")} />
                  منتجات ستنفد لكنها لا تحقق الشروط ({reorder.excluded.length})
                </button>
                {showExcluded && <AlertsTable rows={reorder.excluded} excluded />}
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={cn(
                  "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                  filter === c.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {c.label} <span className="opacity-70">({c.count})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            ترتيب حسب
            <AppSelect
              size="sm"
              className="w-48"
              aria-label="ترتيب حسب"
              value={sort}
              onValueChange={(v) => setSort(v as Sort)}
              options={[
                { value: "newest", label: "الأحدث" },
                { value: "margin", label: "هامش الربح" },
                { value: "roi", label: "العائد على رأس المال" },
                { value: "profit", label: "إجمالي الربح المتوقع" },
              ]}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50">
              <tr className="text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-start font-semibold">المنتج</th>
                <th className="px-3 py-2.5 text-start font-semibold">المرحلة</th>
                <th className="px-3 py-2.5 text-center font-semibold">الكمية</th>
                <th className="px-3 py-2.5 text-end font-semibold">التكلفة الواصلة</th>
                <th className="px-3 py-2.5 text-end font-semibold">سعر البيع</th>
                <th className="px-3 py-2.5 text-end font-semibold">ربح القطعة</th>
                <th className="px-3 py-2.5 text-center font-semibold">الهامش</th>
                <th className="px-3 py-2.5 text-center font-semibold">العائد</th>
                <th className="px-3 py-2.5 text-end font-semibold">رأس المال</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    لا توجد منتجات هنا. اضغط «منتج مرشح جديد» للبدء.
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const { result: r, signal, frozen } = shown(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/admin/imports/${c.id}`)}
                      className="cursor-pointer border-t hover:bg-muted/30"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", SIGNAL_STYLES[signal].dot)} title={SIGNAL_STYLES[signal].label} />
                          <div className="min-w-0">
                            <Link href={`/admin/imports/${c.id}`} className="line-clamp-1 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                              {c.name}
                            </Link>
                            <p className="text-[11px] text-muted-foreground">
                              {c.kind === "reimport" ? `إعادة استيراد${c.productName ? ` · ${c.productName}` : ""}` : "منتج جديد"}
                              {frozen && " · لقطة ثابتة"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <StageCell candidate={c} />
                      </td>
                      <td className="px-3 py-2.5 text-center">{fmtNum(c.inputs.quantity)}</td>
                      <td className="px-3 py-2.5 text-end">{fmtK(r.landedPerUnitKiqd)}</td>
                      <td className="px-3 py-2.5 text-end">{fmtK(c.inputs.sellingPriceKiqd)}</td>
                      <td className={cn("px-3 py-2.5 text-end font-semibold", profitTone(r.profitPerUnitKiqd))}>{fmtK(r.profitPerUnitKiqd)}</td>
                      <td className="px-3 py-2.5 text-center">{fmtPct(r.marginPct, 0)}</td>
                      <td className="px-3 py-2.5 text-center">{fmtPct(r.roiPct, 0)}</td>
                      <td className="px-3 py-2.5 text-end">{fmtK(r.capitalKiqd)}</td>
                      <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {c.status !== "converted" && <DeleteCandidate candidate={c} />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          الأرقام مقرّبة لأقرب 250 د.ع للعرض فقط — الحساب نفسه بدقة كاملة. المنتجات المطلوبة أو الواصلة تُعرض بلقطتها الثابتة لحظة الطلب.
        </p>
      </section>
    </div>
  );
}

/** سطر يشرح أثر كل مرحلة داخل قائمة المراحل. */
const STAGE_HINTS: Partial<Record<ImportStatus, string>> = {
  studying: "الأرقام تتغير مع أي تعديل",
  ordered: "تُجمَّد الأرقام ويُحسب في رأس المال",
  arrived: "جاهز للإضافة إلى المخزون",
  rejected: "يُخفى من النشطة ولا يُحسب",
};

/** المرحلة تُغيَّر من الجدول مباشرة؛ «أُضيف للمخزون» فقط عبر نافذة الوصول. */
function StageCell({ candidate: c }: { candidate: CandidateDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  if (c.status === "converted") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[c.status])}>
        <Check className="h-3 w-3" />
        {IMPORT_STATUS_LABELS[c.status]}
      </span>
    );
  }
  const item = (st: ImportStatus) => (
    <DropdownMenuItem
      key={st}
      disabled={pending}
      onSelect={() => st !== c.status && change(st)}
      className={cn("cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2", st === c.status && "bg-muted/70")}
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS_DOTS[st])} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{IMPORT_STATUS_LABELS[st]}</span>
        {STAGE_HINTS[st] && <span className="block text-[11px] leading-4 text-muted-foreground">{STAGE_HINTS[st]}</span>}
      </span>
      {st === c.status && <Check className="mt-1 h-4 w-4 shrink-0" />}
    </DropdownMenuItem>
  );
  const change = (status: string) =>
    start(async () => {
      const res = await setImportCandidateStatus(c.id, status);
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) router.refresh();
    });
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild disabled={pending}>
          <button
            type="button"
            aria-label={`مرحلة ${c.name}: ${IMPORT_STATUS_LABELS[c.status]}`}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pe-2 ps-2.5 text-xs font-semibold outline-none ring-offset-background transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 data-[state=open]:ring-2 data-[state=open]:ring-ring/20 dark:hover:brightness-125",
              STATUS_STYLES[c.status],
            )}
          >
            <span className={cn("size-1.5 rounded-full", STATUS_DOTS[c.status])} />
            {IMPORT_STATUS_LABELS[c.status]}
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 rounded-xl p-1.5">
          <DropdownMenuLabel className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">تغيير المرحلة</DropdownMenuLabel>
          {MANUAL_STATUSES.filter((st) => st !== "rejected").map(item)}
          <DropdownMenuSeparator />
          {item("rejected")}
        </DropdownMenuContent>
      </DropdownMenu>
      {c.status === "arrived" && (
        <Link
          href={`/admin/imports/${c.id}?arrive=1`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-muted"
        >
          <PackagePlus className="h-3.5 w-3.5" />
          أضف للمخزون
        </Link>
      )}
    </div>
  );
}

function DeleteCandidate({ candidate: c }: { candidate: CandidateDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const res = await deleteImportCandidate(c.id);
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <AlertDialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label={`حذف ${c.name}`}
          title="حذف"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-sm gap-5 rounded-2xl p-6 sm:rounded-2xl">
        <AlertDialogHeader className="items-center space-y-3 text-center sm:text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-600 ring-8 ring-red-500/5 dark:text-red-400">
            <Trash2 className="size-5" />
          </span>
          <AlertDialogTitle className="text-base">حذف «{c.name}»؟</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6">
            تُحذف دراسة هذا المنتج وحساباته نهائياً ولا يمكن استرجاعها. المخزون والمنتج في المتجر لا يتأثران.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-xs">
          <span className="text-muted-foreground">المرحلة الحالية</span>
          <span className={cn("rounded-md px-2 py-0.5 font-semibold", STATUS_STYLES[c.status])}>{IMPORT_STATUS_LABELS[c.status]}</span>
        </div>
        <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:grid sm:gap-2">
          <AlertDialogCancel disabled={pending} className="mt-0 rounded-lg">
            إلغاء
          </AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={remove} className="gap-1.5 rounded-lg">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {pending ? "جارٍ الحذف…" : "حذف نهائياً"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AlertsTable({ rows, excluded }: { rows: ReorderAlert[]; excluded?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full min-w-[820px] text-sm", excluded && "text-muted-foreground")}>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 text-start font-medium">المنتج</th>
            <th className="py-2 text-center font-medium">المخزون</th>
            <th className="py-2 text-center font-medium">بيع/شهر</th>
            <th className="py-2 text-center font-medium">ينفد خلال</th>
            <th className="py-2 text-center font-medium">الهامش</th>
            <th className="py-2 text-center font-medium">ربح شهري</th>
            {excluded ? (
              <th className="py-2 text-start font-medium">سبب الاستبعاد</th>
            ) : (
              <>
                <th className="py-2 text-center font-medium">ربح يضيع</th>
                <th className="py-2 text-center font-medium">الكمية المقترحة</th>
              </>
            )}
            <th className="py-2 text-end font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.productId} className="border-b last:border-0">
              <td className="py-2 font-medium">
                <span className="line-clamp-1">{a.name}</span>
              </td>
              <td className="py-2 text-center">{a.stock}</td>
              <td className="py-2 text-center">{fmtNum(a.unitsPerDay * 30, 1)}</td>
              <td className="py-2 text-center">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-semibold",
                    excluded
                      ? "bg-muted"
                      : a.orderNow
                        ? "bg-red-500/15 text-red-700 dark:text-red-400"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                  )}
                >
                  {fmtNum(a.daysToStockout)} يوم
                </span>
              </td>
              <td className="py-2 text-center">{fmtPct(a.marginPct, 0)}</td>
              <td className={cn("py-2 text-center", !excluded && profitTone(a.monthlyProfitKiqd))}>{fmtK(a.monthlyProfitKiqd)}</td>
              {excluded ? (
                <td className="py-2 text-xs">{a.excludedReason}</td>
              ) : (
                <>
                  <td className="py-2 text-center">{a.lostProfitKiqd > 0 ? fmtK(a.lostProfitKiqd) : "—"}</td>
                  <td className="py-2 text-center">{fmtNum(a.suggestedQty)}</td>
                </>
              )}
              <td className="py-2 text-end">
                {a.hasOpenCandidate ? (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    لديه طلب مفتوح
                  </span>
                ) : (
                  <Link
                    href={`/admin/imports/new?productId=${a.productId}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition",
                      excluded
                        ? "border bg-card text-foreground hover:bg-muted"
                        : "bg-foreground text-background hover:opacity-90",
                    )}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    ابدأ إعادة استيراد
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!excluded && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          «ربح يضيع» = ربح الأيام التي يبقى فيها المنتج نافداً إذا طلبته اليوم. الترتيب حسبه ثم حسب الربح الشهري.
        </p>
      )}
    </div>
  );
}
