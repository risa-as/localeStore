"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  getAdInsights,
  setAdActive,
  setCampaignActive,
} from "@/lib/actions/insights.actions";
import {
  DATE_PRESETS,
  type AdInsightsResult,
  type AccountInsight,
  type AdInsightRow,
  type AdSetRow,
  type CampaignRow,
} from "@/lib/meta/insights";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
  Play,
  Pause,
  Layers,
  Clock3,
  XCircle,
  PauseCircle,
  Archive,
  Package,
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

/** تصنيف حالة الإعلان في مجموعات يفهمها المالك بنظرة واحدة. */
export type HealthFilter = "all" | "active" | "attention" | "rejected" | "paused";
export type InsightsHealth = "running" | "problem" | "idle" | null;

export function bucketOf(status: string): Exclude<HealthFilter, "all"> {
  if (status === "ACTIVE") return "active";
  if (status === "DISAPPROVED") return "rejected";
  if (["WITH_ISSUES", "PENDING_REVIEW", "IN_PROCESS"].includes(status))
    return "attention";
  return "paused";
}

/** شرائح التصفية السريعة بألوان دالة على الحالة. */
const HEALTH_BUCKETS: {
  key: Exclude<HealthFilter, "all">;
  label: string;
  dot: string;
  on: string;
}[] = [
  {
    key: "active",
    label: "نشطة الآن",
    dot: "bg-green-500",
    on: "border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  },
  {
    key: "attention",
    label: "بحاجة متابعة",
    dot: "bg-amber-500",
    on: "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500",
  },
  {
    key: "rejected",
    label: "مرفوضة",
    dot: "bg-red-500",
    on: "border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  },
  {
    key: "paused",
    label: "موقوفة",
    dot: "bg-muted-foreground/50",
    on: "border-border bg-muted text-foreground",
  },
];

/** حكم الحالة تحت اسم الإعلان — نص ولون وأيقونة. */
function verdictFor(status: string): {
  text: string;
  cls: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  if (status === "ACTIVE")
    return {
      text: "تعمل الآن وتُعرض للجمهور",
      cls: "text-green-600 dark:text-green-400",
      Icon: Radio,
    };
  if (status === "PENDING_REVIEW" || status === "IN_PROCESS")
    return {
      text: "بانتظار مراجعة Meta قبل العرض",
      cls: "text-amber-600 dark:text-amber-500",
      Icon: Clock3,
    };
  if (status === "WITH_ISSUES")
    return {
      text: "متوقفة — بها مشكلة يجب حلها",
      cls: "text-amber-600 dark:text-amber-500",
      Icon: AlertTriangle,
    };
  if (status === "DISAPPROVED")
    return {
      text: "فشل الإعلان — رفضته Meta",
      cls: "text-red-600 dark:text-red-400",
      Icon: XCircle,
    };
  if (status === "ARCHIVED" || status === "DELETED")
    return {
      text: STATUS_AR[status] || status,
      cls: "text-muted-foreground",
      Icon: Archive,
    };
  return {
    text: "موقوفة — لا تُعرض للجمهور حالياً",
    cls: "text-muted-foreground",
    Icon: PauseCircle,
  };
}

export default function InsightsPanel({
  onHealth,
}: {
  onHealth?: (h: InsightsHealth) => void;
}) {
  const [preset, setPreset] = useState("last_30d");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
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

  // تحديث حالة إعلان محلياً بعد تشغيله/إطفائه (بلا إعادة جلب الكل).
/** تحديث حالة حملة محلياً بعد تشغيلها/إطفائها (بلا إعادة جلب الكل). */
const setCampaignStatus = useCallback(
  (accId: string, campId: string, status: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        accounts: prev.accounts.map((a) => {
          if (a.id !== accId) return a;
          const campaigns = a.campaigns.map((c) =>
            c.id === campId ? { ...c, status } : c,
          );
          const ads = campaigns.flatMap((c) => c.ads);
          return {
            ...a,
            campaigns,
            ads,
            activeCount: ads.filter((ad) => ad.status === "ACTIVE").length,
          };
        }),
      };
    });
  },
  [],
);

  const setAdStatus = useCallback(
    (accId: string, adId: string, status: string) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          accounts: prev.accounts.map((a) => {
            if (a.id !== accId) return a;
            const ads = a.ads.map((ad) =>
              ad.id === adId ? { ...ad, status } : ad,
            );
            return {
              ...a,
              ads,
              activeCount: ads.filter((ad) => ad.status === "ACTIVE").length,
            };
          }),
        };
      });
    },
    [],
  );

/** عدّادات الفئات تُحتسب من الحملات (كل إعلاناتها) — المصدر الوحيد للحقيقة. */
function countAllAds(a: AccountInsight): AdInsightRow[] {
  return a.campaigns.length > 0
    ? a.campaigns.flatMap((c) => c.ads)
    : a.ads;
}

  // تصفية الحسابات حسب تصنيف الحالة المختار (مع إبقاء الحساب الذي أرجع خطأً ظاهراً).
  const visibleAccounts = useMemo(() => {
    if (!data?.ok) return [];
    return data.accounts
      .map((acc) => {
        const allAds = countAllAds(acc);
        const campaigns =
          healthFilter === "all"
            ? acc.campaigns
            : acc.campaigns
                .map((c) => ({
                  ...c,
                  ads: c.ads.filter(
                    (ad) => bucketOf(ad.status) === healthFilter,
                  ),
                  adSets: c.adSets
                    .map((s) => ({
                      ...s,
                      ads: s.ads.filter(
                        (ad) => bucketOf(ad.status) === healthFilter,
                      ),
                    }))
                    .filter((s) => s.ads.length > 0),
                }))
                .filter((c) => c.ads.length > 0);
        return {
          acc,
          allAds,
          campaigns,
          ads:
            healthFilter === "all"
              ? allAds
              : allAds.filter((ad) => bucketOf(ad.status) === healthFilter),
        };
      })
      .filter((x) => !!x.acc.error || x.ads.length > 0);
  }, [data, healthFilter]);

  // عدّادات الشرائح من البيانات الحالية.
  const bucketCounts = useMemo(() => {
    const c: Record<HealthFilter, number> = {
      all: 0,
      active: 0,
      attention: 0,
      rejected: 0,
      paused: 0,
    };
    if (data?.ok)
      for (const a of data.accounts)
        for (const ad of countAllAds(a)) {
          c[bucketOf(ad.status)] += 1;
          c.all += 1;
        }
    return c;
  }, [data]);

  // نبضة عامة تُعرض كنقطة على تبويب «الأداء» أينما كان المالك في الصفحة.
  const health: InsightsHealth = useMemo(() => {
    if (!data) return null;
    if (!data.ok) return "problem";
    const ads = data.accounts.flatMap((a) => countAllAds(a));
    if (
      ads.some(
        (ad) =>
          bucketOf(ad.status) === "rejected" ||
          bucketOf(ad.status) === "attention",
      )
    )
      return "problem";
    if (ads.some((ad) => ad.status === "ACTIVE")) return "running";
    return "idle";
  }, [data]);

  useEffect(() => {
    onHealth?.(health);
  }, [health, onHealth]);

  const totals = data?.totals;

  return (
    <div className="space-y-5">
      {/* ── شريط الفلاتر ── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* مؤشر الجلب — نوع العرض («النشطة الآن») وُحّد في شريط «حالة الإعلانات» أدناه */}
        <div className="flex items-center justify-end">
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

        {/* تصفية سريعة بحالة الإعلان — الفئات بأعدادها الحية */}
        {data?.ok && bucketCounts.all > 0 && (
          <div className="border-t pt-3 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground ms-1">
              حالة الإعلانات:
            </span>
            <HealthChip
              label="الكل"
              count={bucketCounts.all}
              dot="bg-primary"
              onCls="border-primary bg-primary/10 text-primary"
              on={healthFilter === "all" && !activeOnly}
              onClick={() => {
                setHealthFilter("all");
                if (activeOnly) setActiveOnly(false); // إلغاء جلب «النشطة فقط» من Meta
              }}
            />
            {HEALTH_BUCKETS.map((b) => {
              const isLive = b.key === "active";
              return (
                <HealthChip
                  key={b.key}
                  label={b.label}
                  count={bucketCounts[b.key]}
                  dot={b.dot}
                  onCls={b.on}
                  on={isLive ? activeOnly : healthFilter === b.key}
                  onClick={() => {
                    if (isLive) {
                      // توحيد: «نشطة الآن» هنا = الجلب الحي للنشطة من Meta +
                      // التصفية المحلية معاً (بدل الزر المكرر الذي كان أعلاه).
                      const next = !activeOnly;
                      setActiveOnly(next);
                      setHealthFilter(next ? "active" : "all");
                    } else {
                      setHealthFilter(b.key);
                    }
                  }}
                />
              );
            })}
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

      {/* ── الحسابات — حسابان في الصف، وثلاثة على الشاشات الأوسع (بطاقات متساوية
          الارتفاع داخل الصف) ── */}
      {data?.ok && visibleAccounts.length === 0 && bucketCounts.all > 0 && (
        <div className="rounded-xl border bg-card p-6 text-center space-y-2">
          <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="font-semibold">لا إعلانات في هذا التصنيف</p>
          <p className="text-sm text-muted-foreground">
            جرّب تصنيفاً آخر أو وسّع الفترة الزمنية.
          </p>
        </div>
      )}
      {data?.ok && visibleAccounts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch">
          {visibleAccounts.map(({ acc, campaigns }) => (
            <AccountCard
              key={acc.id}
              acc={acc}
              campaigns={campaigns}
              activeOnly={activeOnly}
              filtered={healthFilter !== "all"}
              onAdStatus={(adId, status) => setAdStatus(acc.id, adId, status)}
              onCampaignStatus={(campId, status) =>
                setCampaignStatus(acc.id, campId, status)
              }
            />
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

/** شريحة تصفية بحالة الإعلان — نقطة ملونة + اسم + عدد حي. */
function HealthChip({
  label,
  count,
  dot,
  onCls,
  on,
  onClick,
}: {
  label: string;
  count: number;
  dot: string;
  onCls: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
        on ? onCls : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] leading-4 ${
          on ? "bg-background/70" : "bg-muted"
        }`}
        dir="ltr"
      >
        {count}
      </span>
    </button>
  );
}

function AccountCard({
  acc,
  campaigns,
  activeOnly,
  filtered,
  onAdStatus,
  onCampaignStatus,
}: {
  acc: AccountInsight;
  campaigns: CampaignRow[];
  activeOnly: boolean;
  filtered: boolean;
  onAdStatus: (adId: string, status: string) => void;
  onCampaignStatus: (campId: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // الحساب الآن نصف/ثلث عرض الصفحة — نعرض أهم 4 حملات (صفّان × عمودين) والبقية بزر.
  const shown = open ? campaigns : campaigns.slice(0, 4);
  const hasMore = campaigns.length > 4;

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5 flex flex-col gap-4 h-full">
      {/* رأس الحساب */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-lg truncate">{acc.name}</h3>
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

      {/* مقاييس الحساب — شرائح مدمجة */}
      <div className="flex flex-wrap gap-2">
        <SummaryChip
          icon={<ShoppingBag className="w-3.5 h-3.5" />}
          label="كلفة الشراء"
          value={cost(acc.purchase.cost, acc.currency)}
          sub={`${num(acc.purchase.count)} شراء`}
        />
        <SummaryChip
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          label="كلفة الرسالة"
          value={cost(acc.message.cost, acc.currency)}
          sub={`${num(acc.message.count)} محادثة`}
        />
        <SummaryChip label="ظهور" value={num(acc.impressions)} />
        <SummaryChip label="وصول" value={num(acc.reach)} />
      </div>

      {/* بطاقات الحملات — الوحدة التي يديرها المالك؛ كل بطاقة توسّع لعرض
          المجموعات الإعلانية وإعلاناتها عند توفر أكثر من واحدة */}
      {campaigns.length > 0 ? (
        <div className="space-y-3 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shown.map((camp) => (
              <CampaignCard
                key={camp.id}
                camp={camp}
                currency={acc.currency}
                onCampaignStatus={(status) =>
                  onCampaignStatus(camp.id, status)
                }
                onAdStatus={onAdStatus}
              />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full py-2 text-xs text-primary hover:bg-muted rounded-lg border border-dashed flex items-center justify-center gap-1"
            >
              {open ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> إخفاء
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> عرض كل الحملات (
                  {campaigns.length})
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground text-center">
          {filtered
            ? "لا حملات بهذه الحالة في هذا الحساب."
            : activeOnly
              ? "لا إعلانات نشطة في هذا الحساب ضمن الفترة."
              : "لا إعلانات بصرف في هذه الفترة."}
        </div>
      )}
    </div>
  );
}

function SummaryChip({
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
    <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-2">
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <div className="leading-tight">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold" dir="ltr">
          {value}
          {sub && (
            <span className="text-[11px] font-normal text-muted-foreground ms-1">
              ({sub})
            </span>
          )}
        </p>
      </div>
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

/**
 * بطاقة الحملة الإعلانية — الوحدة التي يديرها المالك في مدير إعلانات Meta.
 * حافة ملونة بحالة الحملة، وعند وجود أكثر من مجموعة إعلانية أو أكثر من إعلان
 * يظهر زر توسيع يعرض المجموعات وإعلانات كل مجموعة.
 */
function CampaignCard({
  camp,
  currency,
  onCampaignStatus,
  onAdStatus,
}: {
  camp: CampaignRow;
  currency: string | null;
  onCampaignStatus: (status: string) => void;
  onAdStatus: (adId: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const running = camp.status === "ACTIVE";
  const bucket = bucketOf(camp.status);
  const edge =
    bucket === "active"
      ? "border-s-green-500"
      : bucket === "attention"
        ? "border-s-amber-500"
        : bucket === "rejected"
          ? "border-s-red-500"
          : "border-s-muted-foreground/40";
  const verdict = verdictFor(camp.status);
  const achieved = camp.purchase.count > 0 || camp.message.count > 0;
  const spendingNoResults = camp.spend > 0 && !achieved;
  const primary =
    camp.purchase.count > 0 || (camp.purchase.cost != null && camp.message.cost == null)
      ? { label: "كلفة الشراء", m: camp.purchase, unit: "شراء" }
      : { label: "كلفة الرسالة", m: camp.message, unit: "محادثة" };
  const objLabel = objectiveLabel(camp.objective);
  const result =
    camp.purchase.count > 0
      ? `${num(camp.purchase.count)} شراء`
      : camp.message.count > 0
        ? `${num(camp.message.count)} محادثة`
        : "لا نتائج بعد";
  // توسيع تلقائي إذا الحملة فيها أكثر من مجموعة إعلانية أو أكثر من إعلان.
  const hasChildren = camp.adSets.length > 1 || camp.ads.length > 1;
  const childCount =
    camp.adSets.length > 0
      ? camp.adSets.length
      : camp.ads.length;

  const toggle = () =>
    startTransition(async () => {
      const r = await setCampaignActive(camp.id, !running);
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: r.success ? 6000 : 5000,
      });
      if (r.success && r.status)
        onCampaignStatus(r.status === "ACTIVE" ? "ACTIVE" : "CAMPAIGN_PAUSED");
    });

  return (
    <div
      className={`rounded-xl border bg-card border-s-4 flex flex-col gap-2.5 p-4 hover:border-primary/40 hover:shadow-sm transition-all ${edge}`}
    >
      {/* رأس البطاقة: الحالة + الهدف */}
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={camp.status} />
        {objLabel && (
          <span className="text-[10px] text-muted-foreground rounded-full border px-1.5 py-0.5 leading-none shrink-0">
            {objLabel}
          </span>
        )}
      </div>
      {/* اسم الحملة + المنتج المرتبط */}
      <p
        className="font-semibold text-sm leading-snug line-clamp-2"
        title={camp.name}
      >
        {camp.name}
      </p>
      {camp.productName && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Package className="w-3 h-3 shrink-0" />
          {camp.productName}
          {camp.productAuto && <span className="opacity-60">(تلقائي)</span>}
        </p>
      )}
      {/* حكم الحالة */}
      <p className={`text-xs font-medium flex items-center gap-1 ${verdict.cls}`}>
        <verdict.Icon className="w-3.5 h-3.5 shrink-0" />
        {verdict.text}
      </p>
      {/* المقاييس */}
      <div className="pt-2 border-t space-y-1.5">
        <Line
          label={
            camp.budget?.period === "lifetime"
              ? "الميزانية الإجمالية"
              : "الميزانية اليومية"
          }
          value={camp.budget ? money(camp.budget.amount, currency) : "—"}
          strong
        />
        <Line label="الصرف" value={money(camp.spend, currency)} strong />
        <Line
          label={primary.label}
          value={cost(primary.m.cost, currency)}
          strong
          accent={achieved ? "ok" : spendingNoResults ? "warn" : undefined}
        />
        <Line label="النتيجة" value={result} />
        <Line label="ظهور" value={num(camp.impressions)} />
      </div>
      {/* أزرار الإدارة */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`flex-1 h-9 rounded-lg border text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 ${
            running
              ? "border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              : "border-green-300 dark:border-green-900 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
          }`}
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : running ? (
            <>
              <Pause className="w-4 h-4" /> إيقاف الحملة
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> تشغيل الحملة
            </>
          )}
        </button>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="h-9 px-3 rounded-lg border text-xs text-muted-foreground hover:bg-muted flex items-center gap-1"
            title="المجموعات الإعلانية والإعلانات داخل هذه الحملة"
          >
            {open ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {childCount}
          </button>
        )}
      </div>
      {/* التوسيع: المجموعات الإعلانية وإعلاناتها */}
      {open && hasChildren && (
        <div className="border-t pt-3 space-y-3">
          {camp.adSets.length > 1 || camp.adSets.some((s) => s.ads.length > 1) ? (
            camp.adSets.map((s) => (
              <AdSetBlock
                key={s.id}
                set={s}
                currency={currency}
                onAdStatus={onAdStatus}
              />
            ))
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {camp.ads.map((ad) => (
                <AdMiniCard
                  key={ad.id}
                  ad={ad}
                  currency={currency}
                  onStatus={(status) => onAdStatus(ad.id, status)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** مجموعة إعلانية داخل الحملة — عنوان صغير وقائمة إعلاناتها. */
function AdSetBlock({
  set,
  currency,
  onAdStatus,
}: {
  set: AdSetRow;
  currency: string | null;
  onAdStatus: (adId: string, status: string) => void;
}) {
  const setBadge = deriveSetBadge(set.status);
  return (
    <div className="rounded-lg border bg-background/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold truncate flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {set.name}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {set.budget && (
            <span
              className="text-[10px] text-muted-foreground rounded-full border px-1.5 py-0.5 leading-none"
              dir="ltr"
            >
              {money(set.budget.amount, currency)}
              {set.budget.period === "lifetime" ? " /إجمالي" : " /يوم"}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${setBadge.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${setBadge.dot}`} />
            {setBadge.label}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {set.ads.map((ad) => (
          <AdMiniCard
            key={ad.id}
            ad={ad}
            currency={currency}
            onStatus={(status) => onAdStatus(ad.id, status)}
          />
        ))}
        {set.ads.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-1">
            لا إعلانات ضمن هذه المجموعة.
          </p>
        )}
      </div>
    </div>
  );
}

function deriveSetBadge(status: string): {
  label: string;
  cls: string;
  dot: string;
} {
  switch (status) {
    case "ACTIVE":
      return {
        label: "نشطة",
        cls: "border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400",
        dot: "bg-green-500",
      };
    case "ADSET_ATTENTION":
      return {
        label: "بحاجة متابعة",
        cls: "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500",
        dot: "bg-amber-500",
      };
    case "ADSET_REJECTED":
      return {
        label: "مرفوضة",
        cls: "border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
        dot: "bg-red-500",
      };
    case "ADSET_NO_ACTIVE_ADS":
      return {
        label: "بلا إعلانات",
        cls: "border-border bg-muted text-muted-foreground",
        dot: "bg-muted-foreground/50",
      };
    default:
      return {
        label: "موقوفة",
        cls: "border-border bg-muted text-muted-foreground",
        dot: "bg-muted-foreground/50",
      };
  }
}

/** بطاقة إعلان مختصرة داخل الحملة. */
function AdMiniCard({
  ad,
  currency,
  onStatus,
}: {
  ad: AdInsightRow;
  currency: string | null;
  onStatus: (status: string) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isSales =
    (ad.objective || "").includes("SALES") ||
    (ad.objective || "").includes("CONVERSION");
  const primary = isSales
    ? { label: "كلفة الشراء", m: ad.purchase, unit: "شراء" }
    : { label: "كلفة الرسالة", m: ad.message, unit: "محادثة" };
  const running = ad.status === "ACTIVE";
  const bucket = bucketOf(ad.status);
  const edge =
    bucket === "active"
      ? "border-s-green-500"
      : bucket === "attention"
        ? "border-s-amber-500"
        : bucket === "rejected"
          ? "border-s-red-500"
          : "border-s-muted-foreground/40";
  const achieved = primary.m.count > 0;
  const spendingNoResults = ad.spend > 0 && !achieved;

  const toggle = () =>
    startTransition(async () => {
      const r = await setAdActive(ad.id, !running);
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: r.success ? 6000 : 5000,
      });
      if (r.success && r.status) onStatus(r.status);
    });

  return (
    <div
      className={`rounded-lg border bg-background p-2.5 border-s-4 flex flex-col gap-1.5 ${edge}`}
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={ad.status} />
        <span className="text-[10px] text-muted-foreground" dir="ltr">
          {money(ad.spend, currency)}
        </span>
      </div>
      <p className="text-xs font-medium leading-snug line-clamp-1" title={ad.name}>
        {prettyAdName(ad.name)}
      </p>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          {primary.label}:{" "}
          <span
            className={`font-bold ${
              achieved
                ? "text-green-600 dark:text-green-400"
                : spendingNoResults
                  ? "text-amber-600 dark:text-amber-500"
                  : ""
            }`}
            dir="ltr"
          >
            {cost(primary.m.cost, currency)}
          </span>
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`text-[11px] font-medium rounded-md border px-2 h-6 flex items-center gap-1 transition-colors disabled:opacity-60 ${
            running
              ? "border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              : "border-green-300 dark:border-green-900 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
          }`}
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : running ? (
            <>
              <Pause className="w-3 h-3" /> إيقاف
            </>
          ) : (
            <>
              <Play className="w-3 h-3" /> تشغيل
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: "ok" | "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`${strong ? "font-bold text-sm" : "text-xs text-muted-foreground"} ${
          accent === "ok"
            ? "text-green-600 dark:text-green-400"
            : accent === "warn"
              ? "text-amber-600 dark:text-amber-500"
              : ""
        }`}
        dir="ltr"
      >
        {value}
      </span>
    </div>
  );
}
