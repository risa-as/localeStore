import { requireAdmin } from "@/lib/auth-guard";
import { getModonStats } from "@/lib/actions/order.actions";
import { Metadata } from "next";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight, CheckCircle2, TrendingUp, TrendingDown, Package, Truck, AlertCircle } from "lucide-react";
import DailyChart from "./daily-chart";

export const metadata: Metadata = { title: "إحصائيات مدن" };

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pending:        { label: "معلق",          bg: "bg-yellow-50 dark:bg-yellow-950/30",  text: "text-yellow-700 dark:text-yellow-400", border: "border-yellow-200 dark:border-yellow-800" },
  completed:      { label: "مكتمل",         bg: "bg-green-50 dark:bg-green-950/30",    text: "text-green-700 dark:text-green-400",   border: "border-green-200 dark:border-green-800" },
  returned:       { label: "راجع",          bg: "bg-red-50 dark:bg-red-950/30",        text: "text-red-600 dark:text-red-400",       border: "border-red-200 dark:border-red-800" },
  returnReceived: { label: "استلام مرتجع", bg: "bg-teal-50 dark:bg-teal-950/30",      text: "text-teal-700 dark:text-teal-400",     border: "border-teal-200 dark:border-teal-800" },
  rescheduled:    { label: "مؤجل",          bg: "bg-indigo-50 dark:bg-indigo-950/30",  text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-200 dark:border-indigo-800" },
  failed:         { label: "فشل التوصيل",  bg: "bg-rose-50 dark:bg-rose-950/30",      text: "text-rose-700 dark:text-rose-400",     border: "border-rose-200 dark:border-rose-800" },
};

export default async function ModonStatsPage() {
  await requireAdmin();
  const { counts, totalSentToModon, totalInModon, missingInModon, missingInLocal, priceStats, daily } = await getModonStats();

  const deliveryRate = totalSentToModon > 0 ? Math.round(((counts.completed ?? 0) / totalSentToModon) * 100) : 0;
  const returnRate   = totalSentToModon > 0 ? Math.round(((counts.returned  ?? 0) / totalSentToModon) * 100) : 0;
  const netDiff      = priceStats.gainAmount - priceStats.lossAmount;

  return (
    <div className="space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">إحصائيات مدن</h1>
      </div>

      {/* KPIs — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="أرسلنا لمدن"   value={totalSentToModon} icon={<Truck className="w-4 h-4" />} />
        <KPI label="موجود في مدن"  value={totalInModon}      icon={<Package className="w-4 h-4" />} />
        <KPI label="نسبة التسليم"  value={`${deliveryRate}%`} icon={<TrendingUp className="w-4 h-4" />}   color={deliveryRate >= 70 ? "green" : "red"} />
        <KPI label="نسبة الإرجاع"  value={`${returnRate}%`}  icon={<TrendingDown className="w-4 h-4" />} color={returnRate  <= 15 ? "green" : "red"} />
      </div>

      {/* Status breakdown — 2 cols mobile, 3 desktop */}
      <Section title="توزيع الحالات">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(STATUS_META).map(([key, m]) => (
            <Link
              key={key}
              href={`/admin/orders?status=${key}`}
              className={`rounded-xl border ${m.border} ${m.bg} px-3 py-3 flex items-center justify-between active:scale-95 transition-transform`}
            >
              <span className={`text-sm font-medium ${m.text}`}>{m.label}</span>
              <span className={`text-2xl font-bold ${m.text}`}>{counts[key] ?? 0}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Missing orders — stacked on mobile */}
      <Section title="مقارنة مع نظام مدن">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MissingCard title="مفقودة من مدن" subtitle="عندنا باركود — مدن لا تعرفها" count={missingInModon.length}>
            {missingInModon.length === 0 ? <OK /> : (
              <ul className="divide-y text-sm max-h-48 overflow-y-auto">
                {(missingInModon as any[]).map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2 gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate text-sm">{o.fullName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{o.modonQrId}</p>
                    </div>
                    <Link href={`/admin/orders?query=${o.modonQrId}`} className="shrink-0 text-xs text-primary hover:underline">عرض</Link>
                  </li>
                ))}
              </ul>
            )}
          </MissingCard>

          <MissingCard title="مفقودة من نظامنا" subtitle="موجودة في مدن — لا سجل لها عندنا" count={missingInLocal.length}>
            {missingInLocal.length === 0 ? <OK /> : (
              <ul className="divide-y text-sm max-h-48 overflow-y-auto">
                {(missingInLocal as any[]).map((o) => (
                  <li key={o.modonId} className="flex items-center justify-between py-2 gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate text-sm">{o.clientName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{o.modonId}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{o.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </MissingCard>
        </div>
      </Section>

      {/* Price comparison */}
      {priceStats.total > 0 && (
        <Section title={`مقارنة الأسعار — ${priceStats.total} طلب مكتمل`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PriceStat label="مطابق"           value={priceStats.exact} color="text-green-700 dark:text-green-400" />
            <PriceStat label="أقل من المتوقع"  value={priceStats.less}  color="text-red-600 dark:text-red-400"    sub={`-${formatCurrency(priceStats.lossAmount)}`} />
            <PriceStat label="أكثر من المتوقع" value={priceStats.more}  color="text-amber-600 dark:text-amber-400" sub={`+${formatCurrency(priceStats.gainAmount)}`} />
            <PriceStat
              label="الفرق الصافي"
              value={formatCurrency(Math.abs(netDiff))}
              color={netDiff >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}
              sub={netDiff >= 0 ? "زيادة" : "نقص"}
            />
          </div>
        </Section>
      )}

      {/* Daily chart */}
      <Section title="الطلبات المرسلة يومياً — آخر 30 يوم">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <DailyChart data={daily} />
        </div>
      </Section>

    </div>
  );
}

/* ── helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-0.5">{title}</p>
      {children}
    </div>
  );
}

function KPI({ label, value, icon, color }: { label: string; value: string | number; icon?: React.ReactNode; color?: "green" | "red" }) {
  const textColor = color === "green" ? "text-green-700 dark:text-green-400" : color === "red" ? "text-red-600 dark:text-red-400" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <p className={`text-2xl font-bold leading-none ${textColor}`}>{value}</p>
    </div>
  );
}

function PriceStat({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-3 space-y-1">
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className={`text-lg font-bold leading-none ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MissingCard({ title, subtitle, count, children }: { title: string; subtitle: string; count: number; children: React.ReactNode }) {
  const hasProblem = count > 0;
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${hasProblem ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold text-sm leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`flex items-center gap-1 shrink-0 ${hasProblem ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
          {hasProblem ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="text-xl font-bold">{count}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function OK() {
  return (
    <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1.5 py-0.5">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      لا توجد طلبات مفقودة
    </p>
  );
}
