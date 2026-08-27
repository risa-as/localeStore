"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getAdInsights } from "@/lib/actions/insights.actions";
import {
  DATE_PRESETS,
  type AdInsightsResult,
  type AccountInsight,
  type AdInsightRow,
} from "@/lib/meta/insights";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  Loader2,
  AlertTriangle,
  ShoppingBag,
  MessageCircle,
  Wallet,
  ChevronDown,
  ChevronUp,
  Radio,
} from "lucide-react";

function curLabel(code: string | null) {
  const c = (code || "").toUpperCase();
  if (c === "USD") return "$";
  if (c === "IQD") return "د.ع";
  return c || "";
}
/** مبالغ الإعلانات بالعملة الفعلية (بكسور — 4502.23). */
function money(amount: number, currency: string | null) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${curLabel(currency)}`;
}
/** كلفة النتيجة: null → «—» (لا كلفة مُحتسَبة، ليست صفراً). */
function cost(amount: number | null, currency: string | null) {
  return amount == null ? "—" : money(amount, currency);
}
function num(n: number) {
  return n.toLocaleString("en-US");
}

const STATUS_AR: Record<string, string> = {
  ACTIVE: "نشط",
  PAUSED: "موقوف",
  ADSET_PAUSED: "المجموعة موقوفة",
  CAMPAIGN_PAUSED: "الحملة موقوفة",
  ARCHIVED: "مؤرشف",
  DELETED: "محذوف",
  DISAPPROVED: "مرفوض",
  PENDING_REVIEW: "قيد المراجعة",
  IN_PROCESS: "قيد الإعداد",
  WITH_ISSUES: "بها مشكلة",
};

export default function InsightsPanel() {
  const [preset, setPreset] = useState("last_30d");
  const [custom, setCustom] = useState(false);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [data, setData] = useState<AdInsightsResult | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const usingCustom = custom && !!since && !!until;
      const r = await getAdInsights({
        datePreset: usingCustom ? undefined : preset,
        since: usingCustom ? since : undefined,
        until: usingCustom ? until : undefined,
        activeOnly,
      });
      setData(r);
    });
  }, [custom, since, until, preset, activeOnly]);

  // تحميل عند فتح التبويب وعند تغيّر (الفترة/النطاق/النوع). النطاق المخصّص يُحمَّل
  // فقط عند اكتمال الطرفين.
  useEffect(() => {
    if (custom && (!since || !until)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, custom, since, until, activeOnly]);

  const totals = data?.totals;

  return (
    <div className="space-y-5">
      {/* ── شريط الفلاتر ── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* النوع: الكل / النشطة الآن */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1">
            {(
              [
                ["all", "كل الإعلانات"],
                ["active", "النشطة الآن"],
              ] as const
            ).map(([k, lbl]) => {
              const on = (k === "active") === activeOnly;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveOnly(k === "active")}
                  className={`h-9 px-4 rounded-md border text-sm transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {k === "active" && <Radio className="w-3.5 h-3.5 inline ml-1" />}
                  {lbl}
                </button>
              );
            })}
          </div>
          {pending && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ الجلب…
            </span>
          )}
        </div>

        {/* الفترة */}
        <div className="flex gap-1 flex-wrap">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setCustom(false);
                setPreset(p.key);
              }}
              className={`h-8 px-3 rounded-md border text-xs transition-colors ${
                !custom && preset === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustom(true)}
            className={`h-8 px-3 rounded-md border text-xs transition-colors ${
              custom
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            نطاق مخصّص
          </button>
        </div>
        {custom && (
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground">من</label>
              <Input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className="mt-1 h-8 w-40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">إلى</label>
              <Input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="mt-1 h-8 w-40"
              />
            </div>
            {(!since || !until) && (
              <span className="text-xs text-muted-foreground pb-2">
                اختر الطرفين لعرض النتائج
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── الإجمالي ── */}
      {data?.ok && totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Wallet className="w-4 h-4" />}
            label="إجمالي الصرف"
            value={money(totals.spend, totals.currency)}
          />
          <StatCard
            icon={<ShoppingBag className="w-4 h-4" />}
            label="عمليات الشراء"
            value={num(totals.purchases)}
          />
          <StatCard
            icon={<MessageCircle className="w-4 h-4" />}
            label="المحادثات"
            value={num(totals.messages)}
          />
          <StatCard
            icon={<BarChart3 className="w-4 h-4" />}
            label="حسابات ظاهرة"
            value={`${totals.accountsShown} / ${totals.accountsTotal}`}
          />
        </div>
      )}

      {/* ── الحالات ── */}
      {data && !data.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {data.message}
        </div>
      )}
      {data?.ok && data.accounts.length === 0 && (
        <div className="rounded-xl border bg-card p-6 text-center space-y-2">
          <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="font-semibold">
            {activeOnly
              ? "لا توجد حسابات فيها إعلانات نشطة حالياً"
              : "لا توجد بيانات في هذه الفترة"}
          </p>
          <p className="text-sm text-muted-foreground">
            جرّب فترة أوسع أو بدّل إلى «كل الإعلانات».
          </p>
        </div>
      )}

      {/* ── الحسابات ── */}
      {data?.ok && (
        <div className="space-y-3">
          {data.accounts.map((acc) => (
            <AccountCard key={acc.id} acc={acc} activeOnly={activeOnly} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-lg font-bold mt-1" dir="ltr">
        {value}
      </p>
    </div>
  );
}

function AccountCard({
  acc,
  activeOnly,
}: {
  acc: AccountInsight;
  activeOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  // نعرض أهم 5 إعلانات مباشرةً (الفلتر يُظهر الإعلانات، لا يُخفيها)، والبقية بزر.
  const shown = open ? acc.ads : acc.ads.slice(0, 5);
  const hasMore = acc.ads.length > 5;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* رأس الحساب */}
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap border-b bg-muted/20">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{acc.name}</h3>
            {acc.activeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs">
                <Radio className="w-3 h-3" /> {acc.activeCount} نشط
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {acc.accountId}
          </p>
          {acc.error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {acc.error}
            </p>
          )}
        </div>
        <div className="shrink-0 text-end">
          <p className="text-2xl font-bold leading-none" dir="ltr">
            {money(acc.spend, acc.currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">صرف الفترة</p>
        </div>
      </div>

      {/* مقاييس الحساب — بلاطات مؤطّرة، كل تسمية فوق قيمتها مباشرةً */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricTile
          icon={<ShoppingBag className="w-3.5 h-3.5" />}
          label="كلفة الشراء"
          value={cost(acc.purchase.cost, acc.currency)}
          sub={`${num(acc.purchase.count)} شراء`}
        />
        <MetricTile
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          label="كلفة الرسالة"
          value={cost(acc.message.cost, acc.currency)}
          sub={`${num(acc.message.count)} محادثة`}
        />
        <MetricTile label="ظهور" value={num(acc.impressions)} />
        <MetricTile label="وصول" value={num(acc.reach)} />
      </div>

      {/* إعلانات الحساب */}
      {acc.ads.length > 0 ? (
        <div className="border-t">
          {/* رأس أعمدة (على الشاشات المتوسطة فأكبر) — نفس القالب والفجوة تماماً
              كصفوف الإعلانات حتى تتوازى القيم تحت عناوينها. */}
          <div className="hidden sm:grid grid-cols-[1fr_7rem_10rem] gap-x-3 px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
            <span>الإعلان</span>
            <span className="text-end">الصرف</span>
            <span className="text-end">كلفة النتيجة</span>
          </div>
          <div className="divide-y">
            {shown.map((ad) => (
              <AdRow key={ad.id} ad={ad} currency={acc.currency} />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full py-2 text-xs text-primary hover:bg-muted flex items-center justify-center gap-1 border-t"
            >
              {open ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> إخفاء
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> عرض كل الإعلانات (
                  {acc.ads.length})
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {activeOnly
            ? "لا إعلانات نشطة في هذا الحساب ضمن الفترة."
            : "لا إعلانات بصرف في هذه الفترة."}
        </div>
      )}
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 flex flex-col">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-base font-bold mt-1.5" dir="ltr">
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground mt-auto pt-0.5">{sub}</span>}
    </div>
  );
}

/** اسم إعلان أنظف — نحذف لواحق النظام «— التاريخ — إعلان» (لا تمسّ أسماء أخرى). */
function prettyAdName(name: string) {
  const cleaned = name
    .replace(/\s*—\s*إعلان\s*$/, "")
    .replace(/\s*—\s*\d{4}-\d{2}-\d{2}\s*$/, "")
    .trim();
  return cleaned || name;
}

/** تسمية عربية لهدف الحملة. */
function objectiveLabel(obj: string | null) {
  const o = obj || "";
  if (o.includes("SALES") || o.includes("CONVERSION")) return "مبيعات";
  if (o.includes("ENGAGEMENT") || o.includes("MESSAGE")) return "تفاعل";
  if (o.includes("TRAFFIC")) return "زيارات";
  if (o.includes("LEADS")) return "عملاء محتملون";
  if (o.includes("AWARENESS")) return "وعي";
  if (o.includes("APP")) return "تطبيق";
  return null;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  const issue = [
    "WITH_ISSUES",
    "DISAPPROVED",
    "PENDING_REVIEW",
    "IN_PROCESS",
  ].includes(status);
  const cls = active
    ? "border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
    : issue
      ? "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500"
      : "border-border bg-muted text-muted-foreground";
  const dot = active
    ? "bg-green-500"
    : issue
      ? "bg-amber-500"
      : "bg-muted-foreground/50";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none shrink-0 ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {STATUS_AR[status] || status}
    </span>
  );
}

function AdRow({ ad, currency }: { ad: AdInsightRow; currency: string | null }) {
  const isSales = (ad.objective || "").includes("SALES") ||
    (ad.objective || "").includes("CONVERSION");
  // النتيجة الأنسب للهدف؛ إن لم يُحدَّد نُظهر ما له قيمة.
  const primary = isSales
    ? { label: "كلفة الشراء", m: ad.purchase, unit: "شراء" }
    : { label: "كلفة الرسالة", m: ad.message, unit: "محادثة" };
  const objLabel = objectiveLabel(ad.objective);
  const result =
    primary.m.count > 0
      ? `${num(primary.m.count)} ${primary.unit}`
      : "لا نتائج بعد";

  return (
    <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-[1fr_7rem_10rem] gap-x-3 gap-y-2 items-center text-sm hover:bg-muted/30 transition-colors">
      {/* الاسم + الحالة (سطر كامل على الجوال) */}
      <div className="col-span-2 sm:col-span-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={ad.status} />
          <p className="font-medium truncate" title={ad.name}>
            {prettyAdName(ad.name)}
          </p>
        </div>
        {objLabel && (
          <p className="text-xs text-muted-foreground mt-1">هدف: {objLabel}</p>
        )}
      </div>
      {/* الصرف */}
      <div className="text-start sm:text-end">
        <p className="text-xs text-muted-foreground sm:hidden">الصرف</p>
        <p className="font-bold" dir="ltr">
          {money(ad.spend, currency)}
        </p>
      </div>
      {/* كلفة النتيجة */}
      <div className="text-start sm:text-end">
        <p className="text-xs text-muted-foreground sm:hidden">{primary.label}</p>
        <p className="font-bold" dir="ltr">
          {cost(primary.m.cost, currency)}
        </p>
        <p className="text-xs text-muted-foreground">{result}</p>
      </div>
    </div>
  );
}
