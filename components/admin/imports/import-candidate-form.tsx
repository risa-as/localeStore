"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  History,
  Info,
  Loader2,
  PackagePlus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  computeImport,
  historyToInputs,
  importSignal,
  usdToKiqd,
  type ImportInputs,
} from "@/lib/import-calc";
import {
  COMMITTED_STATUSES,
  IMPORT_STATUS_LABELS,
  MANUAL_STATUSES,
  type ImportStatus,
} from "@/lib/import-status";
import {
  convertImportCandidate,
  createImportCandidate,
  deleteImportCandidate,
  getProductsForImport,
  getReimportHistory,
  refreshImportSnapshot,
  setImportCandidateStatus,
  updateImportCandidate,
  type CandidateDTO,
  type ImportSettingsDTO,
  type ReimportHistory,
} from "@/lib/actions/import.actions";
import { cn } from "@/lib/utils";
import {
  SIGNAL_STYLES,
  STATUS_STYLES,
  fmtK,
  fmtKExact,
  fmtNum,
  fmtPct,
  fmtUsd,
  profitTone,
} from "./format";

type ProductOption = { id: string; name: string; price: number; stock: number };

type NumKey =
  | "quantity"
  | "moq"
  | "unitPriceUsd"
  | "intlShippingUsd"
  | "alibabaFeePct"
  | "cardFeePct"
  | "cardFixedUsd"
  | "fxRate"
  | "customsKiqd"
  | "oneOffKiqd"
  | "opsCostPerUnitKiqd"
  | "sellingPriceKiqd"
  | "netDeliveryPerOrderKiqd"
  | "unitsPerOrder"
  | "cpaUsd"
  | "deliveryRatePct"
  | "leadTimeDays";

type FormState = {
  name: string;
  kind: "new" | "reimport";
  productId: string;
  supplierName: string;
  supplierUrl: string;
  notes: string;
} & Record<NumKey, string>;

const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v.toFixed(4))));
const num = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function initialState(
  c: CandidateDTO | undefined,
  settings: ImportSettingsDTO,
  fx: number | null,
  preset?: ProductOption,
): FormState {
  if (c) {
    const i = c.inputs;
    return {
      name: c.name,
      kind: c.kind,
      productId: c.productId ?? "",
      supplierName: c.supplierName ?? "",
      supplierUrl: c.supplierUrl ?? "",
      notes: c.notes ?? "",
      quantity: s(i.quantity),
      moq: s(c.moq),
      unitPriceUsd: s(i.unitPriceUsd),
      intlShippingUsd: s(i.intlShippingUsd),
      alibabaFeePct: s(i.alibabaFeePct),
      cardFeePct: s(i.cardFeePct),
      cardFixedUsd: s(i.cardFixedUsd),
      fxRate: s(i.fxRate),
      customsKiqd: s(i.customsKiqd),
      oneOffKiqd: s(i.oneOffKiqd),
      opsCostPerUnitKiqd: s(i.opsCostPerUnitKiqd),
      sellingPriceKiqd: s(i.sellingPriceKiqd),
      netDeliveryPerOrderKiqd: s(i.netDeliveryPerOrderKiqd),
      unitsPerOrder: s(i.unitsPerOrder),
      cpaUsd: s(i.cpaUsd),
      deliveryRatePct: s(i.deliveryRatePct),
      leadTimeDays: s(c.leadTimeDays),
    };
  }
  return {
    name: preset?.name ?? "",
    kind: preset ? "reimport" : "new",
    productId: preset?.id ?? "",
    supplierName: "",
    supplierUrl: "",
    notes: "",
    quantity: "",
    moq: "",
    unitPriceUsd: "",
    intlShippingUsd: "0",
    alibabaFeePct: s(settings.alibabaFeePct),
    cardFeePct: s(settings.cardFeePct),
    cardFixedUsd: s(settings.cardFixedUsd),
    fxRate: s(fx),
    customsKiqd: "0",
    oneOffKiqd: "0",
    opsCostPerUnitKiqd: s(settings.opsCostPerUnitKiqd),
    sellingPriceKiqd: preset ? s(preset.price) : "",
    netDeliveryPerOrderKiqd: "0",
    unitsPerOrder: "1",
    cpaUsd: s(settings.defaultCpaUsd),
    deliveryRatePct: s(settings.defaultDeliveryRatePct),
    leadTimeDays: "",
  };
}

function toInputs(f: FormState): ImportInputs {
  return {
    quantity: num(f.quantity),
    unitPriceUsd: num(f.unitPriceUsd),
    intlShippingUsd: num(f.intlShippingUsd),
    alibabaFeePct: num(f.alibabaFeePct),
    cardFeePct: num(f.cardFeePct),
    cardFixedUsd: num(f.cardFixedUsd),
    fxRate: num(f.fxRate),
    customsKiqd: num(f.customsKiqd),
    oneOffKiqd: num(f.oneOffKiqd),
    opsCostPerUnitKiqd: num(f.opsCostPerUnitKiqd),
    sellingPriceKiqd: num(f.sellingPriceKiqd),
    netDeliveryPerOrderKiqd: num(f.netDeliveryPerOrderKiqd),
    unitsPerOrder: num(f.unitsPerOrder) || 1,
    cpaUsd: num(f.cpaUsd),
    deliveryRatePct: num(f.deliveryRatePct),
  };
}

// ─── عناصر صغيرة ─────────────────────────────────────────────────────────────

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  unit,
  value,
  onChange,
  hint,
  disabled,
  step = "any",
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {/* الحقل والوحدة إطار واحد: الحدود والزوايا على الغلاف، فلا تتأثر باتجاه
          الحقل (ltr للأرقام) ولا تغطي الوحدة الرقم. */}
      <div
        className={cn(
          "flex h-9 items-stretch overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring",
          disabled && "opacity-50",
        )}
      >
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          dir="ltr"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-full min-w-0 rounded-none border-0 text-right tabular-nums shadow-none focus-visible:ring-0 disabled:opacity-100"
        />
        {unit && (
          <span className="flex shrink-0 items-center whitespace-nowrap border-s border-input bg-muted px-2.5 text-[11px] text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Line({ label, value, strong, tone, muted }: { label: React.ReactNode; value: string; strong?: boolean; tone?: string; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", muted && "text-muted-foreground", strong && "font-semibold")}>
      <span>{label}</span>
      <span dir="ltr" className={cn("tabular-nums", tone)}>
        {value}
      </span>
    </div>
  );
}

// ─── النموذج ─────────────────────────────────────────────────────────────────

export default function ImportCandidateForm({
  candidate,
  settings,
  products: initialProducts,
  fxDefault,
  presetProductId,
  comparison,
}: {
  candidate?: CandidateDTO;
  settings: ImportSettingsDTO;
  products: ProductOption[];
  fxDefault: number | null;
  presetProductId?: string;
  comparison?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [products, setProducts] = useState(initialProducts);
  const preset = presetProductId ? products.find((p) => p.id === presetProductId) : undefined;
  const [initial] = useState(() => initialState(candidate, settings, fxDefault, preset));
  const [f, setF] = useState<FormState>(initial);
  const [saving, startSaving] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [showOneOff, setShowOneOff] = useState(num(initial.oneOffKiqd) > 0);

  const locked = candidate?.status === "converted";
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (k: keyof FormState) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const inputs = useMemo(() => toInputs(f), [f]);
  const r = useMemo(() => computeImport(inputs), [inputs]);
  const signal = importSignal(r, settings.targetMarginPct);
  const fx = num(f.fxRate);
  const usdHint = (usd: string) => (fx > 0 && num(usd) > 0 ? `≈ ${fmtK(usdToKiqd(num(usd), fx))}` : undefined);
  const kHint = (k: string) => (num(k) !== 0 ? `= ${fmtKExact(num(k))}` : undefined);

  // ── التاريخ الفعلي لإعادة الاستيراد ──
  const [windowDays, setWindowDays] = useState(String(settings.historyWindowDays));
  const [history, setHistory] = useState<ReimportHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const autoApplied = useRef(false);

  const applyHistory = useCallback(
    (h: ReimportHistory, fxRate: number) => {
      if (!h.stats || h.stats.derived.resolvedOrders === 0) return;
      const v = historyToInputs(h.stats.derived, fxRate);
      setF((p) => ({
        ...p,
        sellingPriceKiqd: s(v.sellingPriceKiqd),
        netDeliveryPerOrderKiqd: "0",
        unitsPerOrder: s(Number(v.unitsPerOrder.toFixed(2))),
        deliveryRatePct: s(Number(v.deliveryRatePct.toFixed(1))),
        cpaUsd: s(Number(v.cpaUsd.toFixed(2))),
      }));
    },
    [],
  );

  const loadHistory = useCallback(
    async (productId: string, days: number) => {
      setHistoryLoading(true);
      try {
        const h = await getReimportHistory(productId, days);
        setHistory(h);
        // منتج مرشح جديد: تُعبّأ الأرقام الفعلية تلقائياً مرة واحدة.
        if (!candidate && !autoApplied.current && fx > 0) {
          autoApplied.current = true;
          applyHistory(h, fx);
        }
      } catch {
        toast({ variant: "destructive", description: "تعذّر تحميل الأرقام الفعلية" });
      } finally {
        setHistoryLoading(false);
      }
    },
    // fx مقصود خارج الاعتماديات: التحميل يتبع المنتج والفترة فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidate, applyHistory, toast],
  );

  useEffect(() => {
    if (f.kind === "reimport" && f.productId) {
      void loadHistory(f.productId, num(windowDays) || settings.historyWindowDays);
    } else {
      setHistory(null);
    }
    // الفترة تُطبَّق بزر «تحديث» لا مع كل ضغطة مفتاح.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.kind, f.productId]);

  const onPickProduct = (id: string) => {
    autoApplied.current = false;
    const p = products.find((x) => x.id === id);
    setF((prev) => ({
      ...prev,
      productId: id,
      name: prev.name.trim() ? prev.name : p?.name ?? "",
      sellingPriceKiqd: prev.sellingPriceKiqd || (p ? s(p.price) : ""),
    }));
  };

  // ── حفظ ──
  const payload = () => ({
    name: f.name,
    kind: f.kind,
    productId: f.productId || null,
    supplierName: f.supplierName || null,
    supplierUrl: f.supplierUrl || null,
    notes: f.notes || null,
    quantity: num(f.quantity),
    moq: f.moq ? num(f.moq) : null,
    unitPriceUsd: num(f.unitPriceUsd),
    intlShippingUsd: num(f.intlShippingUsd),
    alibabaFeePct: num(f.alibabaFeePct),
    cardFeePct: num(f.cardFeePct),
    cardFixedUsd: num(f.cardFixedUsd),
    fxRate: num(f.fxRate),
    customsKiqd: num(f.customsKiqd),
    oneOffKiqd: num(f.oneOffKiqd),
    opsCostPerUnitKiqd: num(f.opsCostPerUnitKiqd),
    sellingPriceKiqd: num(f.sellingPriceKiqd),
    netDeliveryPerOrderKiqd: num(f.netDeliveryPerOrderKiqd),
    unitsPerOrder: num(f.unitsPerOrder) || 1,
    cpaUsd: num(f.cpaUsd),
    deliveryRatePct: num(f.deliveryRatePct),
    leadTimeDays: f.leadTimeDays ? num(f.leadTimeDays) : null,
  });

  const save = () =>
    startSaving(async () => {
      if (candidate) {
        const res = await updateImportCandidate(candidate.id, payload());
        toast({ variant: res.success ? "default" : "destructive", description: res.message });
        if (res.success) router.refresh();
      } else {
        const res = await createImportCandidate(payload());
        toast({ variant: res.success ? "default" : "destructive", description: res.message });
        if (res.success && res.id) router.push(`/admin/imports/${res.id}`);
      }
    });

  const changeStatus = (status: string) =>
    startStatus(async () => {
      if (!candidate) return;
      const res = await setImportCandidateStatus(candidate.id, status);
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) router.refresh();
    });

  const refreshSnap = () =>
    startStatus(async () => {
      if (!candidate) return;
      const res = await refreshImportSnapshot(candidate.id);
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) router.refresh();
    });

  const remove = () =>
    startStatus(async () => {
      if (!candidate || !window.confirm(`حذف «${candidate.name}» نهائياً؟`)) return;
      const res = await deleteImportCandidate(candidate.id);
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) router.push("/admin/imports");
    });

  const [arrivalOpen, setArrivalOpen] = useState(false);

  const snap = candidate?.snapshot ?? null;
  const snapDiffers = !!snap && Math.abs(snap.result.profitPerUnitKiqd - r.profitPerUnitKiqd) > 0.001;
  const stats = history?.stats ?? null;
  const d = stats?.derived;
  const hasHistory = !!d && d.resolvedOrders > 0;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        {candidate && (
          <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <span className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[candidate.status])}>
              {IMPORT_STATUS_LABELS[candidate.status]}
            </span>
            {!locked && (
              <label className="flex items-center gap-2 text-sm">
                تغيير المرحلة
                <select
                  value={candidate.status}
                  disabled={statusPending || dirty}
                  onChange={(e) => changeStatus(e.target.value)}
                  className="rounded-lg border bg-background px-2 py-1.5 text-sm"
                >
                  {MANUAL_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {IMPORT_STATUS_LABELS[st as ImportStatus]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {dirty && !locked && <span className="text-xs text-amber-600">احفظ التعديلات قبل تغيير المرحلة</span>}
            {candidate.status === "arrived" && (
              <Button size="sm" className="gap-1.5" disabled={dirty} onClick={() => setArrivalOpen(true)}>
                <PackagePlus className="h-4 w-4" />
                إضافة الشحنة للمخزون
              </Button>
            )}
            <div className="ms-auto flex items-center gap-2">
              {!locked && (
                <Button size="sm" variant="ghost" className="gap-1.5 text-red-600" onClick={remove} disabled={statusPending}>
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              )}
            </div>
            {locked && candidate.batchId && (
              <p className="w-full text-xs text-muted-foreground">
                أُضيفت كدفعة جديدة ({fmtNum(candidate.receivedQty)} قطعة بتكلفة واصلة {fmtK(candidate.actualLandedKiqd)}) —{" "}
                <Link href="/admin/batches" className="underline">
                  عرض الدفعات
                </Link>
              </p>
            )}
          </section>
        )}

        {comparison}

        <Section title="المنتج">
          <div className="flex gap-2">
            {(["new", "reimport"] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={locked}
                onClick={() => setF((p) => ({ ...p, kind: k }))}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  f.kind === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {k === "new" ? "منتج جديد" : "إعادة استيراد منتج موجود"}
              </button>
            ))}
          </div>
          {f.kind === "reimport" && (
            <div className="space-y-1">
              <Label htmlFor="ic-product" className="text-xs">
                المنتج في المتجر
              </Label>
              <select
                id="ic-product"
                value={f.productId}
                disabled={locked}
                onChange={(e) => onPickProduct(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">— اختر المنتج —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (المخزون {p.stock})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ic-name" className="text-xs">
              اسم المنتج
            </Label>
            <Input id="ic-name" value={f.name} disabled={locked} onChange={(e) => set("name")(e.target.value)} />
          </div>
        </Section>

        {f.kind === "reimport" && f.productId && (
          <Section
            title="الأرقام الفعلية من متجرك"
            aside={
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">آخر</span>
                <Input
                  type="number"
                  dir="ltr"
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  className="h-8 w-20 text-center"
                  aria-label="عدد الأيام"
                />
                <span className="text-xs text-muted-foreground">يوم</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  disabled={historyLoading}
                  onClick={() => loadHistory(f.productId, num(windowDays) || settings.historyWindowDays)}
                >
                  {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  تحديث
                </Button>
              </div>
            }
          >
            {historyLoading && !history ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ حساب الأرقام الفعلية…
              </p>
            ) : history && stats ? (
              <div className="space-y-4">
                {history.report.warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w.text}
                  </p>
                ))}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    من {history.report.from} إلى {history.report.to} · {fmtNum(d?.resolvedOrders)} طلب محسوم
                  </span>
                  {stats.lowConfidence ? (
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400">
                      بيانات غير كافية (أقل من {history.minHistoryOrders} طلب) — اعتمد على تقديرك
                    </span>
                  ) : (
                    <span className="rounded-md bg-green-500/15 px-2 py-0.5 font-semibold text-green-700 dark:text-green-400">ثقة جيدة</span>
                  )}
                </div>

                {hasHistory ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px] text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="py-1.5 text-start font-medium" />
                          <th className="py-1.5 text-center font-medium">الفعلي</th>
                          <th className="py-1.5 text-center font-medium">المعتمد في الحساب</th>
                        </tr>
                      </thead>
                      <tbody className="[&_td]:py-1.5">
                        <tr className="border-b">
                          <td>صافي سعر البيع للقطعة</td>
                          <td className="text-center">{fmtK(d!.sellingPriceKiqd)}</td>
                          <td className="text-center">{fmtK(num(f.sellingPriceKiqd))}</td>
                        </tr>
                        <tr className="border-b">
                          <td>نسبة نجاح التوصيل</td>
                          <td className="text-center">{fmtPct(d!.deliveryRatePct)}</td>
                          <td className="text-center">{fmtPct(num(f.deliveryRatePct))}</td>
                        </tr>
                        <tr className="border-b">
                          <td>تكلفة الإعلان لكل طلب</td>
                          <td className="text-center">{fmtUsd(fx > 0 ? (d!.cpaKiqd * 1000) / fx : null)}</td>
                          <td className="text-center">{fmtUsd(num(f.cpaUsd))}</td>
                        </tr>
                        <tr className="border-b">
                          <td>قطع في الطلب الواحد</td>
                          <td className="text-center">{fmtNum(d!.unitsPerOrder, 2)}</td>
                          <td className="text-center">{fmtNum(num(f.unitsPerOrder), 2)}</td>
                        </tr>
                        <tr>
                          <td>ربح القطعة بعد الإعلان (صفحة الأرباح)</td>
                          <td className={cn("text-center font-semibold", profitTone(d!.profitPerUnitKiqd))}>{fmtK(d!.profitPerUnitKiqd)}</td>
                          <td className={cn("text-center font-semibold", profitTone(r.profitPerUnitKiqd))}>{fmtK(r.profitPerUnitKiqd)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا توجد طلبات محسومة لهذا المنتج في هذه الفترة.</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!hasHistory || fx <= 0 || locked} onClick={() => history && applyHistory(history, fx)}>
                    استخدم الأرقام الفعلية
                  </Button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  سعر البيع الفعلي صافٍ من العروض ومن تكلفة التوصيل الفعلية، لذلك يُضبط «صافي التوصيل» على صفر عند استخدامه. تكلفة الإعلان لكل طلب محسوم (مسلَّم أو راجع).
                </p>

                <div className="grid gap-3 border-t pt-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground">المخزون الحالي</p>
                    <p className="font-semibold">{fmtNum(stats.stock)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">بيع/يوم</p>
                    <p className="font-semibold">{fmtNum(stats.unitsPerDay, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">ينفد خلال</p>
                    <p className={cn("font-semibold", history.reorder?.orderNow && "text-red-600 dark:text-red-400")}>
                      {history.reorder?.daysToStockout != null ? `${fmtNum(history.reorder.daysToStockout)} يوم` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">تكلفة آخر دفعة</p>
                    <p className="font-semibold">{fmtK(stats.latestBatchCostKiqd)}</p>
                  </div>
                </div>
                {history.reorder && history.reorder.suggestedQty > 0 && (
                  <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm", history.reorder.orderNow ? "bg-red-500/10" : "bg-muted")}>
                    <span>
                      {history.reorder.orderNow
                        ? "اطلب الآن — المخزون سينفد قبل وصول شحنة جديدة."
                        : `يجب الطلب خلال ${fmtNum(history.reorder.daysUntilOrder)} يوم تقريباً.`}{" "}
                      الكمية المقترحة: <strong>{fmtNum(history.reorder.suggestedQty)}</strong> قطعة (تغطي {settings.reorderCoverDays} يوماً بعد الوصول).
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => set("quantity")(String(history.reorder!.suggestedQty))}
                    >
                      استخدم الكمية المقترحة
                    </Button>
                  </div>
                )}
                {stats.latestBatchCostKiqd !== null && r.landedPerUnitKiqd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    التكلفة الواصلة الجديدة {fmtK(r.landedPerUnitKiqd)} مقابل {fmtK(stats.latestBatchCostKiqd)} في آخر دفعة (
                    <span className={profitTone(stats.latestBatchCostKiqd - r.landedPerUnitKiqd)}>
                      {r.landedPerUnitKiqd <= stats.latestBatchCostKiqd ? "أرخص" : "أغلى"} بـ {fmtK(Math.abs(r.landedPerUnitKiqd - stats.latestBatchCostKiqd))}
                    </span>
                    ).
                  </p>
                )}
              </div>
            ) : null}
          </Section>
        )}

        <Section title="الشراء من الصين">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="ic-qty" label="الكمية" unit="قطعة" step="1" value={f.quantity} onChange={set("quantity")} disabled={locked} />
            <Field id="ic-unit" label="سعر القطعة" unit="$" value={f.unitPriceUsd} onChange={set("unitPriceUsd")} hint={usdHint(f.unitPriceUsd)} disabled={locked} />
            <Field id="ic-ship" label="الشحن الدولي للشحنة كاملة" unit="$" value={f.intlShippingUsd} onChange={set("intlShippingUsd")} hint={usdHint(f.intlShippingUsd)} disabled={locked} />
            <Field id="ic-ali" label="عمولة علي بابا" unit="٪" value={f.alibabaFeePct} onChange={set("alibabaFeePct")} hint="على البضاعة + الشحن" disabled={locked} />
            <Field id="ic-card" label="عمولة البطاقة" unit="٪" value={f.cardFeePct} onChange={set("cardFeePct")} hint="على كل ما يُدفع بالبطاقة" disabled={locked} />
            <Field id="ic-cardfix" label="رسوم البطاقة الثابتة" unit="$" value={f.cardFixedUsd} onChange={set("cardFixedUsd")} disabled={locked} />
            <Field
              id="ic-fx"
              label="سعر الصرف (للبضاعة والإعلانات)"
              unit="د.ع/$"
              value={f.fxRate}
              onChange={set("fxRate")}
              disabled={locked}
              hint={
                fxDefault ? (
                  <button type="button" className="underline-offset-2 hover:underline" disabled={locked} onClick={() => set("fxRate")(String(fxDefault))}>
                    السعر الساري: {fmtNum(fxDefault)}
                  </button>
                ) : (
                  "لا يوجد سعر صرف مسجّل"
                )
              }
            />
            <Field id="ic-lead" label="مدة وصول هذه الشحنة" unit="يوم" step="1" value={f.leadTimeDays} onChange={set("leadTimeDays")} hint={`فارغ = ${settings.leadTimeDays} يوم`} disabled={locked} />
          </div>
        </Section>

        <Section title="تكاليف محلية">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ic-customs" label="الجمارك والتخليص للشحنة" unit="ألف د.ع" value={f.customsKiqd} onChange={set("customsKiqd")} hint={kHint(f.customsKiqd)} disabled={locked} />
            <Field
              id="ic-ops"
              label="تكاليف التشغيل للقطعة"
              unit="ألف د.ع"
              value={f.opsCostPerUnitKiqd}
              onChange={set("opsCostPerUnitKiqd")}
              hint={`${kHint(f.opsCostPerUnitKiqd) ?? "= 0 د.ع"} — تغليف ولاصق وفاتورة (0.05 = 50 د.ع)`}
              disabled={locked}
            />
          </div>
          <button type="button" onClick={() => setShowOneOff((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showOneOff && "rotate-180")} />
            تكاليف إضافية لمرة واحدة (اختياري)
          </button>
          {showOneOff && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="ic-oneoff" label="عينات أو تكلفة استثنائية" unit="ألف د.ع" value={f.oneOffKiqd} onChange={set("oneOffKiqd")} hint={`${kHint(f.oneOffKiqd) ?? "= 0 د.ع"} — تُوزَّع على قطع الشحنة`} disabled={locked} />
            </div>
          )}
        </Section>

        <Section title="البيع والإعلان">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="ic-price" label="صافي سعر البيع للقطعة" unit="ألف د.ع" value={f.sellingPriceKiqd} onChange={set("sellingPriceKiqd")} hint={`${kHint(f.sellingPriceKiqd) ?? ""} بعد العروض`} disabled={locked} />
            <Field
              id="ic-deliv"
              label="صافي التوصيل لكل طلب"
              unit="ألف د.ع"
              value={f.netDeliveryPerOrderKiqd}
              onChange={set("netDeliveryPerOrderKiqd")}
              hint="ما تدفعه للمندوب ناقص ما يدفعه الزبون"
              disabled={locked}
            />
            <Field id="ic-upo" label="قطع في الطلب الواحد" value={f.unitsPerOrder} onChange={set("unitsPerOrder")} disabled={locked} />
            <Field id="ic-cpa" label="تكلفة الإعلان لكل طلب" unit="$" value={f.cpaUsd} onChange={set("cpaUsd")} hint={usdHint(f.cpaUsd)} disabled={locked} />
            <Field id="ic-rate" label="نسبة نجاح التوصيل" unit="٪" value={f.deliveryRatePct} onChange={set("deliveryRatePct")} hint="المسلَّم ÷ (المسلَّم + الراجع)" disabled={locked} />
          </div>
        </Section>

        <Section title="ملاحظات">
          <Textarea value={f.notes} disabled={locked} onChange={(e) => set("notes")(e.target.value)} rows={3} />
        </Section>

        {!locked && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={saving || (!!candidate && !dirty)} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {candidate ? "حفظ التعديلات" : "حفظ المنتج المرشح"}
            </Button>
            {candidate && dirty && <span className="text-xs text-amber-600">توجد تعديلات غير محفوظة</span>}
          </div>
        )}
      </div>

      {/* ── النتائج ── */}
      <aside className="space-y-4 lg:sticky lg:top-4">
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">صافي ربح القطعة المسلَّمة</p>
              <p className={cn("text-3xl font-bold tracking-tight", profitTone(r.profitPerUnitKiqd))} dir="ltr">
                {fmtK(r.profitPerUnitKiqd)}
              </p>
              <p className="text-xs text-muted-foreground">هامش {fmtPct(r.marginPct)}</p>
            </div>
            <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", SIGNAL_STYLES[signal].chip)}>{SIGNAL_STYLES[signal].label}</span>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground">تكلفة الشحنة</p>
            <Line label="البضاعة" value={fmtUsd(r.goodsUsd)} muted />
            <Line label="الشحن الدولي" value={fmtUsd(inputs.intlShippingUsd)} muted />
            <Line label="عمولة علي بابا" value={fmtUsd(r.alibabaFeeUsd)} muted />
            <Line label="عمولة البطاقة" value={fmtUsd(r.cardFeeUsd)} muted />
            <Line label="المدفوع بالدولار" value={fmtUsd(r.shipmentUsd)} />
            <Line label="بالدينار + الجمارك والإضافي" value={fmtK(r.shipmentKiqd)} strong />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground">لكل قطعة</p>
            <Line label="صافي سعر البيع" value={fmtK(inputs.sellingPriceKiqd)} />
            <Line label="− التكلفة الواصلة" value={fmtK(r.landedPerUnitKiqd)} muted />
            <Line label="− صافي التوصيل" value={fmtK(r.deliveryPerUnitKiqd)} muted />
            <Line label="− الإعلان لكل قطعة مسلَّمة" value={fmtK(r.adPerUnitKiqd)} muted />
            <Line label="= صافي الربح" value={fmtK(r.profitPerUnitKiqd)} strong tone={profitTone(r.profitPerUnitKiqd)} />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground">الشحنة كاملة</p>
            <Line label="رأس المال المطلوب" value={fmtK(r.capitalKiqd)} />
            <Line label="إجمالي الربح المتوقع" value={fmtK(r.totalProfitKiqd)} tone={profitTone(r.totalProfitKiqd)} />
            <Line label="العائد على رأس المال" value={fmtPct(r.roiPct)} />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground">نقاط التعادل</p>
            <Line label="أعلى تكلفة إعلان لكل طلب" value={fmtUsd(r.breakEvenCpaUsd)} strong />
            <Line label="أقل سعر بيع بلا خسارة" value={fmtK(r.breakEvenPriceKiqd)} />
          </div>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">السيناريوهات</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-start font-medium" />
                <th className="py-1 text-center font-medium">متشائم</th>
                <th className="py-1 text-center font-medium">متوقع</th>
                <th className="py-1 text-center font-medium">متفائل</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-1">
              <tr>
                <td className="text-muted-foreground">الإعلان/طلب</td>
                {(["pessimistic", "expected", "optimistic"] as const).map((k) => (
                  <td key={k} className="text-center" dir="ltr">{fmtUsd(r.scenarios[k].cpaUsd)}</td>
                ))}
              </tr>
              <tr>
                <td className="text-muted-foreground">التوصيل</td>
                {(["pessimistic", "expected", "optimistic"] as const).map((k) => (
                  <td key={k} className="text-center">{fmtPct(r.scenarios[k].deliveryRatePct, 0)}</td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td>ربح القطعة</td>
                {(["pessimistic", "expected", "optimistic"] as const).map((k) => (
                  <td key={k} className={cn("text-center", profitTone(r.scenarios[k].profitPerUnitKiqd))} dir="ltr">
                    {fmtK(r.scenarios[k].profitPerUnitKiqd)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-muted-foreground">إجمالي الربح</td>
                {(["pessimistic", "expected", "optimistic"] as const).map((k) => (
                  <td key={k} className={cn("text-center", profitTone(r.scenarios[k].totalProfitKiqd))} dir="ltr">
                    {fmtK(r.scenarios[k].totalProfitKiqd)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">المتشائم: إعلان أغلى 30٪ وتوصيل أقل 10 نقاط. المتفائل: إعلان أرخص 20٪ وتوصيل أعلى 5 نقاط.</p>
        </section>

        {snap && candidate && COMMITTED_STATUSES.includes(candidate.status) && (
          <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              لقطة الموافقة ({new Date(snap.at).toLocaleDateString("en-GB")})
            </p>
            <Line label="ربح القطعة المجمَّد" value={fmtK(snap.result.profitPerUnitKiqd)} tone={profitTone(snap.result.profitPerUnitKiqd)} />
            <Line label="سعر الصرف المجمَّد" value={fmtNum(snap.inputs.fxRate)} muted />
            {snapDiffers && (
              <div className="space-y-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                <p>الحساب الحالي يختلف عن اللقطة. لوحة القيادة والمقارنة تعتمدان اللقطة.</p>
                <Button size="sm" variant="outline" onClick={refreshSnap} disabled={statusPending || dirty}>
                  تحديث اللقطة بالأرقام الحالية
                </Button>
              </div>
            )}
          </section>
        )}
        <p className="text-[11px] text-muted-foreground">الأرقام مقرّبة لأقرب 250 د.ع للعرض فقط — الحساب بدقة كاملة.</p>
      </aside>

      {candidate && (
        <ArrivalDialog
          open={arrivalOpen}
          onOpenChange={setArrivalOpen}
          candidate={candidate}
          inputs={inputs}
          products={products}
          onRefreshProducts={async () => setProducts(await getProductsForImport())}
        />
      )}
    </div>
  );
}

// ─── نافذة الوصول ────────────────────────────────────────────────────────────

function ArrivalDialog({
  open,
  onOpenChange,
  candidate,
  inputs,
  products,
  onRefreshProducts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate: CandidateDTO;
  inputs: ImportInputs;
  products: ProductOption[];
  onRefreshProducts: () => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState(candidate.productId ?? "");
  const [receivedQty, setReceivedQty] = useState(String(inputs.quantity));
  const [shipping, setShipping] = useState(String(inputs.intlShippingUsd));
  const [customs, setCustoms] = useState(String(inputs.customsKiqd));
  const [fx, setFx] = useState(String(inputs.fxRate));

  const received = num(receivedQty);
  const shipment = computeImport({ ...inputs, intlShippingUsd: num(shipping), customsKiqd: num(customs), fxRate: num(fx) });
  const landed = received > 0 ? shipment.shipmentKiqd / received + inputs.opsCostPerUnitKiqd : 0;
  const reimport = candidate.kind === "reimport";

  const confirm = () =>
    startTransition(async () => {
      const res = await convertImportCandidate(candidate.id, {
        productId,
        receivedQty: received,
        actualIntlShippingUsd: num(shipping),
        actualCustomsKiqd: num(customs),
        actualFxRate: num(fx),
      });
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) {
        onOpenChange(false);
        router.refresh();
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة الشحنة للمخزون</DialogTitle>
          <DialogDescription>
            {reimport
              ? "تُضاف دفعة جديدة لنفس المنتج بالتكلفة الواصلة الحقيقية، ويزيد مخزونه بالكمية المستلمة."
              : "أنشئ المنتج في المتجر أولاً (بصوره ووصفه وبمخزون 0)، ثم اختره هنا لتُضاف الشحنة كدفعة بتكلفتها الحقيقية."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ar-product" className="text-xs">
              المنتج في المتجر
            </Label>
            <select
              id="ar-product"
              value={productId}
              disabled={reimport && !!candidate.productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">— اختر المنتج —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {!reimport && (
              <div className="flex flex-wrap gap-3 text-xs">
                <Link href="/admin/products/create" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">
                  إنشاء المنتج في تبويب جديد
                </Link>
                <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => startTransition(onRefreshProducts)}>
                  تحديث القائمة
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ar-qty" label="الكمية المستلمة فعلاً" unit="قطعة" step="1" value={receivedQty} onChange={setReceivedQty} hint={`المطلوبة: ${fmtNum(inputs.quantity)}`} />
            <Field id="ar-ship" label="الشحن الدولي الفعلي" unit="$" value={shipping} onChange={setShipping} />
            <Field id="ar-customs" label="الجمارك الفعلية" unit="ألف د.ع" value={customs} onChange={setCustoms} hint={num(customs) ? `= ${fmtKExact(num(customs))}` : undefined} />
            <Field id="ar-fx" label="سعر الصرف الفعلي" unit="د.ع/$" value={fx} onChange={setFx} />
          </div>
          <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            <Line label="التكلفة الواصلة الفعلية للقطعة" value={fmtK(landed)} strong />
            <Line label="المتوقعة" value={fmtK(computeImport(inputs).landedPerUnitKiqd)} muted />
            <p className="text-[11px] text-muted-foreground">البضاعة تُدفع على الكمية المطلوبة، والشحنة كلها تُوزَّع على القطع المستلمة.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={pending || !productId || received <= 0} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد الإضافة للمخزون
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
