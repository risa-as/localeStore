"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  checkFxOverlap,
  deleteFxRate,
  getAdAccountsList,
  getPeriodCampaigns,
  getUnifiedCampaignRows,
  importPeriodSpend,
  getCurrentFx,
  getFxRates,
  getLastSync,
  linkCampaignsBulk,
  saveFxRate,
  syncAdSpendOnDate,
  type AdAccountOption,
  type PeriodCampaign,
  type UnifiedCampaignRow,
  type FxOverlap,
  type FxRateRow,
} from "@/lib/actions/adspend.actions";
import {
  createAdCampaign,
  deleteAdCampaign,
  updateAdCampaign,
} from "@/lib/actions/expense.actions";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronsUpDown,
  DollarSign,
  Info,
  Layers,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";

/* ─── مساعدات مشتركة ──────────────────────────────────────────────────────── */

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
/** إزاحة بغداد الثابتة UTC+3 (لا توقيت صيفي). */
const BAGHDAD_OFFSET_MS = 3 * HOUR;

/** yyyy-mm-dd بتوقيت بغداد الحقيقي — إزاحة 3 ساعات على الطابع الزمني.
    (النسخة السابقة ضربت 3 × DAY = ثلاثة أيام كاملة بالخطأ فتقدّم التاريخ 3 أيام.) */
function baghdadDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + BAGHDAD_OFFSET_MS).toISOString().slice(0, 10);
}
function iraqTodayStr(): string {
  return baghdadDateStr();
}
function iraqMonthStartStr(): string {
  return iraqTodayStr().slice(0, 7) + "-01";
}
function daysAgoStr(n: number): string {
  return baghdadDateStr(new Date(Date.now() - n * DAY));
}
/* ─── بطاقة سعر الصرف ─────────────────────────────────────────────────────── */

function FxRateCard({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [rates, setRates] = useState<FxRateRow[]>([]);
  const [current, setCurrent] = useState<{ rate: number | null; fromDate: string | null }>({
    rate: null,
    fromDate: null,
  });
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  const [overlap, setOverlap] = useState<{
    overlaps: FxOverlap[];
    totalDiffIQD: number;
  } | null>(null);
  const [checking, startCheck] = useTransition();
  const [saving, startSave] = useTransition();

  const reload = () => {
    getFxRates().then(setRates).catch(() => null);
    getCurrentFx().then(setCurrent).catch(() => null);
  };
  useEffect(() => {
    reload();
  }, []);

  const submit = (revalue: boolean) => {
    startSave(async () => {
      const r = await saveFxRate({
        rate: Number(rate),
        fromDate,
        toDate: toDate || null,
        note: note || null,
        revalue,
      });
      toast({
        description:
          r.message +
          (revalue && r.success
            ? " — انعكس الأثر على صفحة الأرباح للفترات المتقاطعة."
            : ""),
        variant: r.success ? undefined : "destructive",
        duration: revalue ? 9000 : undefined,
      });
      if (r.success) {
        setOpen(false);
        setOverlap(null);
        setRate("");
        setFromDate("");
        setToDate("");
        setNote("");
        reload();
        onChanged?.();
      }
    });
  };

  const onCheck = () => {
    if (!(Number(rate) > 0) || !fromDate) {
      toast({ description: "أدخل السعر وتاريخ البداية", variant: "destructive" });
      return;
    }
    startCheck(async () => {
      const r = await checkFxOverlap({
        rate: Number(rate),
        fromDate,
        toDate: toDate || null,
      });
      if (r.overlaps.length === 0) {
        submit(false);
        return;
      }
      setOverlap(r);
      setOpen(true);
    });
  };

  const onDelete = (id: string) =>
    startSave(async () => {
      const r = await deleteFxRate(id);
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
      });
      if (r.success) reload();
    });

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">سعر صرف الدولار</h3>
            {current.rate != null ? (
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/30 px-2 py-0.5 text-xs font-bold text-primary"
                  dir="ltr"
                >
                  1 $ = {current.rate.toLocaleString()} د.ع
                </span>
                <span className="text-xs text-muted-foreground">
                  ساري من{" "}
                  <span dir="ltr" className="font-medium text-foreground">
                    {current.fromDate}
                  </span>
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                لا يوجد سعر بعد — أدخله لتتمكن المزامنة من التحويل
              </p>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <DollarSign className="w-4 h-4 ml-1" /> إضافة سعر
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setOverlap(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة فترة سعر صرف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">السعر (د.ع / $1)</label>
                <Input
                  type="number"
                  min={1}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="مثلاً 1310"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ملاحظة (اختياري)</label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="سعر السوق"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">من تاريخ</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  إلى تاريخ (فارغ = ساري حتى إشعار آخر)
                </label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {overlap && overlap.overlaps.length > 0 && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  هذه الفترة تتقاطع مع {overlap.overlaps.length} فترة بسعر مختلف:
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">الفترة القائمة</TableHead>
                        <TableHead className="text-xs">سعرها</TableHead>
                        <TableHead className="text-xs">أيام مشتركة</TableHead>
                        <TableHead className="text-xs">صرفها ($)</TableHead>
                        <TableHead className="text-xs">فرق الدينار</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overlap.overlaps.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs" dir="ltr">
                            {o.fromDate} → {o.toDate ?? "∞"}
                          </TableCell>
                          <TableCell className="text-xs font-bold">
                            {o.rate.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs">{o.overlapDays}</TableCell>
                          <TableCell className="text-xs" dir="ltr">
                            {o.overlapUsd.toFixed(2)}
                          </TableCell>
                          <TableCell
                            className={`text-xs font-bold ${
                              o.diffIQD >= 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {o.diffIQD >= 0 ? "+" : ""}
                            {Math.round(o.diffIQD).toLocaleString()} د.ع
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  إجمالي الأثر:{" "}
                  <span
                    className={`font-bold ${
                      overlap.totalDiffIQD >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {overlap.totalDiffIQD >= 0 ? "+" : ""}
                    {Math.round(overlap.totalDiffIQD).toLocaleString()} د.ع
                  </span>{" "}
                  إن أعدت التقييم.
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              {overlap && overlap.overlaps.length > 0 ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => submit(false)}
                  >
                    حفظ بلا مساس المحسوب
                  </Button>
                  <Button size="sm" disabled={saving} onClick={() => submit(true)}>
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-4 h-4 ml-1" /> أعد تقييم الأيام المتقاطعة
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button size="sm" disabled={checking || saving} onClick={onCheck}>
                  {checking || saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "حفظ"
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {rates.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-right">السعر (د.ع/$1)</TableHead>
                <TableHead className="text-right">من</TableHead>
                <TableHead className="text-right">إلى</TableHead>
                <TableHead className="text-center">أيام مستوردة</TableHead>
                <TableHead className="text-right">إجمالي طبّق عليه</TableHead>
                <TableHead>ملاحظة</TableHead>
                <TableHead className="text-center w-12">حذف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => {
                const isCurrent = current.rate === r.rate;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-bold",
                          isCurrent && "text-primary",
                        )}
                        dir="ltr"
                      >
                        {isCurrent && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        )}
                        {r.rate.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground" dir="ltr">
                      {r.fromDate}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground" dir="ltr">
                      {r.toDate ?? (
                        <span className="inline-flex items-center gap-1 text-primary font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          ساري
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.appliedDays > 0 ? (
                        <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs">
                          {r.appliedDays}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs" dir="ltr">
                      {r.appliedDays > 0 ? (
                        <span className="font-medium">
                          {r.appliedUsd.toFixed(2)} $
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(r.id)}
                        disabled={saving}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ─── شريط المزامنة: آخر مزامنة + زر يوم محدد ────────────────────────────── */

function SyncBar({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [last, setLast] = useState<Awaited<ReturnType<typeof getLastSync>> | null>(null);
  const [pending, start] = useTransition();
  const [day, setDay] = useState<string>(daysAgoStr(1));

  const reload = () => getLastSync().then(setLast).catch(() => null);
  useEffect(() => {
    reload();
  }, []);

  const run = () =>
    start(async () => {
      const r = await syncAdSpendOnDate(day || undefined);
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: 8000,
      });
      reload();
      onChanged?.();
    });

  return (
    <div className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-xs">
        {last?.date ? (
          <>
            {last.ok ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
            <span className="text-muted-foreground">
              آخر مزامنة: <span className="font-bold text-foreground">{last.date}</span> —{" "}
              {last.rows} صف من {last.accountsOk} حساب
              {last.accountsErr ? (
                <span className="text-red-600"> ({last.accountsErr} فشل)</span>
              ) : null}
              {last.unlinked ? ` — ${last.unlinked} حملة بلا منتج` : ""}
            </span>
            {last.unlinked > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {last.unlinked} حملة بصرف بلا منتج — صرفها غير محسوب
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Info className="w-4 h-4" /> لا مزامنة بعد — كل يوم يجلب تلقائياً 05:00
            صباحاً
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="h-9 w-[150px] text-xs"
          title="يوم الاستهلاك المراد جلبه"
        />
        <Button size="sm" variant="outline" onClick={run} disabled={pending}>
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="w-4 h-4 ml-1" /> مزامنة اليوم المحدد
            </>
          )}
        </Button>
        <Link
          href="/admin/profit"
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          الأثر في الأرباح ←
        </Link>
      </div>
    </div>
  );
}

/* ─── جلب حملات فترة محددة + الربط الجماعي + استرجاع الصرف ───────────────── */

function PeriodCampaignsFetcher({
  products,
  onMutated,
}: {
  products: { id: string; name: string }[];
  onMutated: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();

  // الافتراضي: بداية الشهر الحالي → اليوم (بتوقيت العراق).
  const [from, setFrom] = useState<string>(iraqMonthStartStr());
  const [to, setTo] = useState<string>(iraqTodayStr());

  // rows === null: لم يُجلب بعد. تبقى ظاهرة بعد الربط وتتحدث حالتها فقط.
  const [rows, setRows] = useState<PeriodCampaign[] | null>(null);
  const [fetching, startFetch] = useTransition();
  const [linking, startLink] = useTransition();
  const [importing, startImport] = useTransition();
  const [picks, setPicks] = useState<Record<string, string>>({}); // campaignId → productId

  // اختيار الحسابات الإعلانية: null = كل الحسابات، غير ذلك = المحدد فقط.
  const [accounts, setAccounts] = useState<AdAccountOption[] | null>(null);
  const [accountSel, setAccountSel] = useState<Set<string> | null>(null);
  const [accOpen, setAccOpen] = useState(false);

  useEffect(() => {
    getAdAccountsList()
      .then((r) => setAccounts(r.ok ? r.accounts : []))
      .catch(() => setAccounts([]));
  }, []);

  /** فلتر الحسابات المرسل للـ backend: null أو المجموعة الكاملة = كل الحسابات. */
  const accountFilter = (): string[] | undefined => {
    if (!accountSel || accountSel.size === 0) return undefined;
    if (accounts && accountSel.size >= accounts.filter((a) => a.active).length)
      return undefined;
    return [...accountSel];
  };

  const unlinkedCount = rows?.filter((r) => !r.linked).length ?? 0;
  const linkedCount = rows?.filter((r) => r.linked).length ?? 0;
  const selectedCount =
    rows?.filter((r) => !r.linked && picks[r.campaignId]).length ?? 0;

  // تجميع الحملات حسب الحساب المالك — أساس العرض الجماعي والإحصاءات.
  const byAccount = useMemo(() => {
    const map = new Map<string, PeriodCampaign[]>();
    for (const c of rows ?? []) {
      const key = c.accountNames[0] ?? "—";
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      const en = (s: string) => (/[a-zA-Z]/.test(s.trim().charAt(0)) ? 0 : 1);
      return en(a[0]) - en(b[0]) || a[0].localeCompare(b[0], "en", { numeric: true });
    });
  }, [rows]);

  // إحصاءات متجاوبة: لكل حساب — تتغير تلقائياً مع الفلتر والفترة.
  const accountStats = useMemo(() => {
    return byAccount.map(([name, list]) => {
      const usd = list.reduce((s, c) => s + c.usd, 0);
      const linked = list.filter((c) => c.linked).length;
      const unlinked = list.length - linked;
      const products = new Set(
        list.filter((c) => c.linked && c.productName).map((c) => c.productName as string),
      );
      return { name, count: list.length, usd, linked, unlinked, products: products.size };
    });
  }, [byAccount]);

  const fetchCampaigns = () => {
    if (!from || !to || from > to) {
      toast({ description: "اختر فترة صالحة (من ≤ إلى)", variant: "destructive" });
      return;
    }
    startFetch(async () => {
      const r = await getPeriodCampaigns({ from, to, accountIds: accountFilter() });
      setRows(r.campaigns);
      // حافظ على الاختيارات السابقة للحملات ما تزال غير مرتبطة.
      setPicks((prev) => {
        const next: Record<string, string> = {};
        for (const c of r.campaigns) if (!c.linked && prev[c.campaignId]) next[c.campaignId] = prev[c.campaignId];
        return next;
      });
      if (r.campaigns.length === 0) {
        toast({ description: "لا حملات بصرف ضمن هذه الفترة", duration: 6000 });
      } else if (r.message) {
        toast({ description: r.message, variant: "destructive", duration: 8000 });
      } else {
        toast({
          description: `جُلبت ${r.campaigns.length} حملة (${r.campaigns.filter((c) => c.linked).length} مرتبطة، ${r.campaigns.filter((c) => !c.linked).length} بلا منتج)`,
          duration: 6000,
        });
      }
    });
  };

  const bulkLink = () => {
    const entries = (rows ?? [])
      .filter((r) => !r.linked && picks[r.campaignId])
      .map((r) => ({
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        productId: picks[r.campaignId],
      }));
    if (entries.length === 0) return;
    startLink(async () => {
      const r = await linkCampaignsBulk(entries);
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: 8000,
      });
      if (r.linked > 0) {
        // القائمة تبقى ظاهرة — نحدّث الحالات محلياً إلى «مرتبطة» فوراً.
        setRows((prev) =>
          prev
            ? prev.map((row) => {
                const e = entries.find((x) => x.campaignId === row.campaignId);
                if (e && r.linked > 0) {
                  const p = products.find((x) => x.id === e.productId);
                  return { ...row, linked: true, productId: e.productId, productName: p?.name ?? null, auto: false };
                }
                return row;
              })
            : prev,
        );
        setPicks({});
        onMutated();
        router.refresh();
        // إن فشل بعض الصفوف: أعد الجلب من المصدر لتصحيح الحالات المعروضة.
        if (r.failed > 0) fetchCampaigns();
      }
    });
  };

  const importSpend = () => {
    if (!from || !to || from > to) {
      toast({ description: "اختر فترة صالحة (من ≤ إلى)", variant: "destructive" });
      return;
    }
    startImport(async () => {
      const r = await importPeriodSpend({ from, to, accountIds: accountFilter() });
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: 10000,
      });
      if (r.rows > 0 || r.days > 0) {
        onMutated();
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <CalendarRange className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">حملات فترة محددة (من Meta مباشرة)</h3>
          <p className="text-xs text-muted-foreground">
            جلب حي لكل الحملات التي لها صرف ضمن الفترة، مع حالة الربط — بلا تخزين.
          </p>
        </div>
      </div>

      {/* فلتر الفترة + الاختصارات */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">من</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px] text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">إلى</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px] text-xs"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setFrom(iraqMonthStartStr());
              setTo(iraqTodayStr());
            }}
            className="h-9 px-3 rounded-md border text-xs text-muted-foreground hover:bg-muted"
          >
            بداية الشهر → اليوم
          </button>
          <button
            type="button"
            onClick={() => {
              setFrom(daysAgoStr(7));
              setTo(iraqTodayStr());
            }}
            className="h-9 px-3 rounded-md border text-xs text-muted-foreground hover:bg-muted"
          >
            آخر 7 أيام
          </button>
          <button
            type="button"
            onClick={() => {
              setFrom(daysAgoStr(30));
              setTo(iraqTodayStr());
            }}
            className="h-9 px-3 rounded-md border text-xs text-muted-foreground hover:bg-muted"
          >
            آخر 30 يوماً
          </button>

          {/* منتقي الحسابات الإعلانية — Popover بطاقات قابلة للنقر */}
          <Popover open={accOpen} onOpenChange={setAccOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={() => setAccOpen((v) => !v)}
                className={cn(
                  "h-9 px-3 rounded-md border text-xs inline-flex items-center gap-1.5 transition-colors",
                  accountSel && accountSel.size > 0
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                {accountSel && accountSel.size > 0
                  ? `${accountSel.size} حساب محدد`
                  : "كل الحسابات الإعلانية"}
                <ChevronsUpDown className="w-3 h-3 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] p-0 overflow-hidden" align="start">
              {/* رأس اللوحة */}
              <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-4 py-3 border-b">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">الحسابات الإعلانية</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {accountSel && accountSel.size > 0
                        ? `محدد: ${accountSel.size} من ${accounts?.filter((a) => a.active).length ?? 0} نشط`
                        : `كل الحسابات (${accounts?.filter((a) => a.active).length ?? 0} نشط من ${accounts?.length ?? 0})`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="text-[11px] px-2 h-7 rounded-md border text-primary hover:bg-primary/10 transition-colors"
                      onClick={() =>
                        setAccountSel(
                          new Set((accounts ?? []).filter((a) => a.active).map((a) => a.id)),
                        )
                      }
                    >
                      تحديد الكل
                    </button>
                    <button
                      type="button"
                      className="text-[11px] px-2 h-7 rounded-md border text-muted-foreground hover:bg-muted transition-colors"
                      onClick={() => setAccountSel(null)}
                    >
                      مسح
                    </button>
                  </div>
                </div>
              </div>

              <Command>
                <div className="p-2 pb-0">
                  <CommandInput placeholder="🔍 ابحث عن حساب بالاسم أو المعرّف..." className="h-9" />
                </div>
                <CommandList className="max-h-[320px] p-1">
                  <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                    لا توجد حسابات مطابقة
                  </CommandEmpty>
                  <CommandGroup>
                    {(accounts ?? [])
                      .slice()
                      .sort((x, y) => {
                        // ط¥ظ†ط¬ظ„ظٹط²ظٹط© ط£ظˆظ„ط§ظ‹ ط«ظ… ط¹ط±ط¨ظٹط© (ظ†ظپط³ طھط±طھظٹط¨ طھط¨ظˆظٹط¨ ط§ظ„ط£ط¯ط§ط،)
                        const en = (s: string) =>
                          /[a-zA-Z]/.test(s.trim().charAt(0)) ? 0 : 1;
                        return (
                          en(x.name) - en(y.name) ||
                          x.name.localeCompare(y.name, "en", {
                            numeric: true,
                            sensitivity: "base",
                          })
                        );
                      })
                      .map((a, i) => {
                      const on = accountSel?.has(a.id) ?? false;
                      // حرف مميز بلون دائري — من اسم الحساب.
                      const initial =
                        a.name?.trim().charAt(0).toUpperCase() ?? "A";
                      const palette = [
                        "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                        "bg-violet-500/15 text-violet-600 dark:text-violet-400",
                        "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                        "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                        "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
                      ];
                      const color = palette[i % palette.length];
                      return (
                        <CommandItem
                          key={a.id}
                          value={`${a.name} ${a.accountId}`}
                          onSelect={() =>
                            setAccountSel((prev) => {
                              const base = prev ?? new Set<string>();
                              const next = new Set(base);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              return next;
                            })
                          }
                          className={cn(
                            "cursor-pointer rounded-lg px-2 py-2 mb-0.5 border transition-colors",
                            on
                              ? "border-primary/50 bg-primary/5"
                              : "border-transparent hover:border-border",
                          )}
                        >
                          {/* مربع تحقق دائري جميل */}
                          <span
                            className={cn(
                              "w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-2 transition-all",
                              on
                                ? "bg-primary border-primary scale-100"
                                : "border-muted-foreground/30 hover:border-primary/60",
                            )}
                          >
                            {on && (
                              <svg
                                viewBox="0 0 24 24"
                                className="w-3 h-3 text-primary-foreground"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={3.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          {/* حرف مميز بلون */}
                          <span
                            className={cn(
                              "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold",
                              color,
                            )}
                          >
                            {initial}
                          </span>
                          {/* الاسم هو البطل — المعرّف ثانوي صغير */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-tight">
                              {a.name}
                            </p>
                            <p
                              className="text-[10px] text-muted-foreground/70 mt-0.5"
                              dir="ltr"
                            >
                              {a.currency} · {a.accountId.slice(-6)}
                            </p>
                          </div>
                          {!a.active && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground shrink-0">
                              غير مفعّل
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>

              {/* تذييل ثابت */}
              <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {accountSel && accountSel.size > 0
                    ? "الجلب والاسترجاع سيقتصران على المحدد"
                    : "سيتم استخدام كل الحسابات النشطة"}
                </span>
                <Button size="sm" className="h-7" onClick={() => setAccOpen(false)}>
                  تم
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {accountSel && accountSel.size > 0 && (
            <button
              type="button"
              onClick={() => setAccountSel(null)}
              className="h-9 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              title="العودة إلى كل الحسابات"
            >
              ✕ إلغاء الفلتر
            </button>
          )}
        </div>
        <Button size="sm" onClick={fetchCampaigns} disabled={fetching}>
          {fetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Zap className="w-4 h-4 ml-1" /> جلب الحملات من Meta
            </>
          )}
        </Button>
      </div>

      {rows === null ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          اختر الفترة ثم اضغط «جلب الحملات من Meta» لعرض كل الحملات ذات الصرف
          وحالة ربطها بالمنتجات.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          لا توجد حملات بصرف ضمن هذه الفترة.
        </div>
      ) : (
        <>
          {/* الملخص + الإجراءات */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {rows.length} حملة —{" "}
              <span className="text-green-600 dark:text-green-400 font-medium">
                {linkedCount} مرتبطة
              </span>{" "}
              /{" "}
              <span
                className={`font-medium ${unlinkedCount ? "text-amber-600 dark:text-amber-400" : ""}`}
              >
                {unlinkedCount} بلا منتج
              </span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={importSpend}
                disabled={importing}
                title="تخزين صرف أيام الفترة للحملات المرتبطة (بأثر رجعي، آمن للتكرار)"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 ml-1" /> استرجاع صرف الفترة
                  </>
                )}
              </Button>
              <Button size="sm" onClick={bulkLink} disabled={linking || selectedCount === 0}>
                {linking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Link2 className="w-4 h-4 ml-1" /> ربط الحملات المحددة ({selectedCount})
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* إحصاءات الحسابات — تتجاوب مع الفلتر والفترة المختارَين */}
          {accountStats.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-3">
              {accountStats.map((s) => (
                <div
                  key={s.name}
                  className="rounded-xl border bg-card p-3 space-y-1.5 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-sm truncate">
                      <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                      {s.name}
                    </span>
                    <span className="text-sm font-bold shrink-0" dir="ltr">
                      {s.usd.toFixed(2)} $
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                    <span className="rounded-full border px-1.5 py-0.5">
                      {s.count} حملة
                    </span>
                    {s.unlinked > 0 ? (
                      <span className="rounded-full border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">
                        {s.unlinked} بلا منتج
                      </span>
                    ) : (
                      <span className="rounded-full border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-1.5 py-0.5">
                        كلها مرتبطة
                      </span>
                    )}
                    {s.products > 0 && (
                      <span className="rounded-full border px-1.5 py-0.5">
                        {s.products} منتج
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* الجدول الحي */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>الحملة</TableHead>
                  <TableHead className="text-right">صرف الفترة ($)</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead>المنتج</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byAccount.flatMap(([accName, list]) => (
                  <Fragment key={accName}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="py-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                            <Layers className="w-3.5 h-3.5 text-primary" />
                            {accName}
                            <span className="text-muted-foreground font-normal">
                              ({list.length} حملة)
                            </span>
                          </span>
                          <span className="text-xs font-bold" dir="ltr">
                            {list.reduce((s, c) => s + c.usd, 0).toFixed(2)} $
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {list.map((c, i) => {
                      const num = i + 1;
                      return (
                      <TableRow key={c.campaignId}>
                      <TableCell className="text-center text-muted-foreground text-sm w-10">
                        {num}
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <span
                          className="font-medium text-sm block truncate"
                          title={c.campaignName ?? undefined}
                        >
                          {c.campaignName ?? c.campaignId}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold" dir="ltr">
                        {c.usd.toFixed(2)}
                      </TableCell>
                    <TableCell className="text-center">
                      {c.linked ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          {c.auto ? "مرتبطة تلقائياً" : "مرتبطة"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
                          <AlertTriangle className="w-3 h-3" /> غير مرتبطة
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.linked ? (
                        <span className="text-sm">{c.productName ?? "—"}</span>
                      ) : (
                        <select
                          value={picks[c.campaignId] ?? ""}
                          onChange={(e) =>
                            setPicks((prev) => ({ ...prev, [c.campaignId]: e.target.value }))
                          }
                          className="h-8 rounded-md border bg-background px-2 text-xs w-full max-w-[220px]"
                        >
                          <option value="">— اختر المنتج —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                      </TableRow>
                      );
                    })}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            «استرجاع صرف الفترة» يخزّن صرف الأيام للحملات المرتبطة (تظهر بعدئذ في
            الجدول الموحّد وصفحة الأرباح). «ربط الحملات المحددة» يحفظ كل الاختيارات
            دفعة واحدة — والقائمة تبقى ظاهرة وتتحدّث حالتها.
          </p>
        </>
      )}
    </div>
  );
}

/* ─── الجدول الموحّد: يدوي + مستورد من Meta ───────────────────────────────── */

function UnifiedCampaignsTable({
  refreshKey,
  products,
  onEdited,
}: {
  refreshKey: number;
  products: { id: string; name: string }[];
  onEdited: () => void;
}) {
  const { toast } = useToast();
  const [from, setFrom] = useState<string>(iraqMonthStartStr());
  const [to, setTo] = useState<string>(iraqTodayStr());
  const [data, setData] = useState<{ rows: UnifiedCampaignRow[]; totalIQD: number; totalUSD: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [deleting, startDelete] = useTransition();
  const [editRow, setEditRow] = useState<UnifiedCampaignRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // حوار الإدخال اليدوي — داخل هذا المكوّن (الزر بجانب رأس الجدول).
  const [manualOpen, setManualOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getUnifiedCampaignRows(
        new Date(`${from}T00:00:00.000Z`),
        new Date(`${to}T00:00:00.000Z`),
      );
      setData(r);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // تجميع صرف كل منتج في الفترة الحالية — بطاقات إحصاءات.
  const productStats = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { usd: number; iqd: number; days: number; manual: number }>();
    for (const row of data.rows) {
      const cur =
        map.get(row.productId) ??
        { usd: 0, iqd: 0, days: 0, manual: 0 };
      cur.usd += row.currency === "USD" ? row.amount : 0;
      cur.iqd += row.amountIQD;
      cur.days += row.days;
      if (row.source === "manual") cur.manual += 1;
      map.set(row.productId, cur);
    }
    return [...map.entries()]
      .map(([productId, v]) => ({
        productId,
        name: data.rows.find((x) => x.productId === productId)?.productName ?? "—",
        ...v,
      }))
      .sort((a, b) => b.iqd - a.iqd);
  }, [data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" />
          حملات الإعلانات — يدوي + مستورد من Meta
        </h3>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="w-4 h-4 ml-1" /> إدخال صرف يدوي
          </Button>
          {data && (data.totalIQD > 0 || data.totalUSD > 0) && (
            <>
            <Badge variant="secondary" dir="ltr">
              ${data.totalUSD.toFixed(2)}
            </Badge>
            <Badge variant="secondary">
              {Math.round(data.totalIQD).toLocaleString()} د.ع
            </Badge>
              <Link
                href="/admin/profit"
                className="text-xs text-primary hover:underline whitespace-nowrap"
              >
                الأثر في الأرباح ←
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">من</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px] text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">إلى</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px] text-xs"
          />
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "عرض"}
        </Button>
      </div>

      {/* إحصاءات الصرف لكل منتج — نفس فترة الجدول */}
      {productStats.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {productStats.map((p) => (
            <div
              key={p.productId}
              className="rounded-xl border bg-card p-3 space-y-1.5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate" title={p.name}>
                  {p.name}
                </span>
                <span className="text-sm font-bold shrink-0" dir="ltr">
                  {Math.round(p.iqd).toLocaleString()} د.ع
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                {p.usd > 0 && (
                  <span className="rounded-full border px-1.5 py-0.5" dir="ltr">
                    {p.usd.toFixed(2)} $
                  </span>
                )}
                <span className="rounded-full border px-1.5 py-0.5">
                  {p.days} يوم صرف
                </span>
                {p.manual > 0 && (
                  <span className="rounded-full border px-1.5 py-0.5">
                    {p.manual} إدخال يدوي
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </p>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا صفوف ضمن هذه الفترة — أضف حملة يدوياً أو استرجع صرف الفترة من القسم
          أعلاه.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead>من</TableHead>
                <TableHead>إلى</TableHead>
                <TableHead className="text-center">أيام</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">المكافئ (د.ع)</TableHead>
                <TableHead className="text-center">المصدر</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-center text-muted-foreground text-sm">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{r.productName}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground" dir="ltr">
                    {r.from}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground" dir="ltr">
                    {r.to}
                  </TableCell>
                  <TableCell className="text-center text-sm">{r.days}</TableCell>
                  <TableCell className="text-right font-semibold text-sm" dir="ltr">
                    {r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                    {r.currency === "USD" ? "$" : "ألف د.ع"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {Math.round(r.amountIQD).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.source === "meta" ? (
                      <Badge variant="secondary" className="text-[10px]">
                        مستورد تلقائياً من Meta
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        يدوي
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.source === "manual" && r.refId ? (
                      <div className="flex justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditRow(r);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={deleting}
                          onClick={() =>
                            startDelete(async () => {
                              if (!r.refId) return;
                              const res = await deleteAdCampaign(r.refId);
                              if (!res.success) {
                                toast({ variant: "destructive", description: res.message });
                              } else {
                                toast({ description: "حُذفت الحملة اليدوية" });
                                load();
                                onEdited();
                              }
                            })
                          }
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-red-500" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* إدخال صرف يدوي — يظهر في الجدول بوسم «يدوي» */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إدخال صرف حملة يدوي</DialogTitle>
          </DialogHeader>
          {manualOpen && (
            <ManualCampaignForm
              products={products}
              onDone={() => {
                setManualOpen(false);
                load();
                onEdited();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {editRow?.refId && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تعديل الحملة اليدوية</DialogTitle>
            </DialogHeader>
            {editOpen && (
              <EditManualCampaignForm
                row={editRow}
                products={products}
                onDone={() => {
                  setEditOpen(false);
                  setEditRow(null);
                  load();
                  onEdited();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** نموذج تعديل مختصر للصف اليدوي داخل الجدول الموحّد. */
function EditManualCampaignForm({
  row,
  products,
  onDone,
}: {
  row: UnifiedCampaignRow;
  products: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    productId: row.productId,
    fromDate: row.from,
    toDate: row.to,
    amount: String(row.amount),
    currency: row.currency,
    notes: null as string | null,
  });

  const submit = () => {
    start(async () => {
      if (!row.refId) return;
      const res = await updateAdCampaign(row.refId, form as never);
      if (res.success) {
        toast({ title: "تم الحفظ بنجاح" });
        onDone();
      } else {
        toast({ variant: "destructive", title: res.message });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground">المنتج</label>
        <select
          value={form.productId}
          onChange={(e) => setForm({ ...form, productId: e.target.value })}
          className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">من تاريخ</label>
          <Input
            className="mt-1"
            type="date"
            value={form.fromDate}
            onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">إلى تاريخ</label>
          <Input
            className="mt-1"
            type="date"
            value={form.toDate}
            onChange={(e) => setForm({ ...form, toDate: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">
            المبلغ <span className="text-[10px]">(بالألف د.ع إذا كانت العملة دينار)</span>
          </label>
          <Input
            className="mt-1"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">العملة</label>
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="IQD">دينار عراقي</option>
            <option value="USD">دولار أمريكي</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          حفظ
        </Button>
      </div>
    </div>
  );
}

/* ─── القسم الكامل المُدمج في تبويب الحملات ───────────────────────────────── */

/** نموذج إدخال صرف حملة يدوي (يُخزَّن في AdCampaign — وسم «يدوي» في الجدول). */
function ManualCampaignForm({
  products,
  onDone,
}: {
  products: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    productId: products[0]?.id ?? "",
    fromDate: iraqMonthStartStr(),
    toDate: iraqTodayStr(),
    amount: "",
    currency: "IQD",
    notes: null as string | null,
  });

  const submit = () => {
    start(async () => {
      const res = await createAdCampaign(form as never);
      if (res.success) {
        toast({ title: "تم حفظ الإدخال اليدوي" });
        onDone();
      } else {
        toast({ variant: "destructive", title: res.message });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground">المنتج</label>
        <select
          value={form.productId}
          onChange={(e) => setForm({ ...form, productId: e.target.value })}
          className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">من تاريخ</label>
          <Input
            className="mt-1"
            type="date"
            value={form.fromDate}
            onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">إلى تاريخ</label>
          <Input
            className="mt-1"
            type="date"
            value={form.toDate}
            onChange={(e) => setForm({ ...form, toDate: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">
            المبلغ <span className="text-[10px]">(بالألف د.ع إذا كانت العملة دينار)</span>
          </label>
          <Input
            className="mt-1"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">العملة</label>
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="IQD">دينار عراقي</option>
            <option value="USD">دولار أمريكي</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          حفظ
        </Button>
      </div>
    </div>
  );
}

export default function AdSpendSection({
  products,
}: {
  products: { id: string; name: string }[];
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <FxRateCard />
      <SyncBar onChanged={bump} />
      <PeriodCampaignsFetcher products={products} onMutated={bump} />
      <UnifiedCampaignsTable
        refreshKey={refreshKey}
        products={products}
        onEdited={bump}
      />
    </div>
  );
}
