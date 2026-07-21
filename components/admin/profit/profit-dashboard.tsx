"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Tajawal } from "next/font/google";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import "./profit-dashboard.css";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

// ── Types ──────────────────────────────────────────────────────────────────

export type ProductStat = {
  productId: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  orderCount: number;
  returnedQty: number;
};

export type DailyPoint = {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
};

export type ProfitDashboardProps = {
  productStats: ProductStat[];
  dailySeries: DailyPoint[];
  orderSummary: {
    totalOrderCount: number;
    baghdadOrderCount: number;
    othersOrderCount: number;
    totalGrossRevenue: number;
    totalActualShippingCost: number;
    baghdadActualShippingCost: number;
    othersActualShippingCost: number;
  };
  fefoActive: boolean;
  fefoFallbackQty: number;
  expenses: {
    totalAdCost: number;
    totalExpenses: number;
    adByProduct: { productId: string; name: string; amount: number }[];
    expenseByCategory: { category: string; amount: number }[];
  };
  /** Same metrics for the immediately preceding period, for the delta badges. */
  comparison: {
    collected: number;
    netProfit: number;
    margin: number;
    orders: number;
  } | null;
  /** Orders whose totalPrice does not equal their own line items + shipping. */
  inconsistentOrders: {
    id: string;
    date: string;
    expected: number;
    actual: number;
    diff: number;
    items: string;
  }[];
};

const DONUT_PALETTE = [
  "oklch(0.72 0.15 155)",
  "oklch(0.66 0.13 175)",
  "oklch(0.68 0.13 200)",
  "oklch(0.70 0.13 230)",
  "oklch(0.64 0.11 260)",
  "oklch(0.66 0.10 290)",
  "oklch(0.62 0.03 250)",
];

type SortKey = "name" | "qty" | "revenue" | "profit" | "margin";
type ChartMetric = "profit" | "revenue" | "orders";

const marginOf = (p: ProductStat) =>
  p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0;

// ── Component ──────────────────────────────────────────────────────────────

export default function ProfitDashboard({
  productStats,
  dailySeries,
  orderSummary,
  fefoActive,
  fefoFallbackQty,
  expenses,
  comparison,
  inconsistentOrders,
}: ProfitDashboardProps) {
  // Expense inputs start from the real database figures and can be overridden
  // locally for what-if analysis. Overrides are never persisted.
  const [adsExpense, setAdsExpense] = useState(expenses.totalAdCost);
  const [opexExpense, setOpexExpense] = useState(expenses.totalExpenses);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("profit");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Open by default — a data-integrity problem should be seen, not hunted for.
  const [warnOpen, setWarnOpen] = useState(true);

  const totals = useMemo(
    () =>
      productStats.reduce(
        (acc, p) => ({
          qty: acc.qty + p.totalQty,
          revenue: acc.revenue + p.totalRevenue,
          cost: acc.cost + p.totalCost,
          profit: acc.profit + p.totalProfit,
          returned: acc.returned + p.returnedQty,
        }),
        { qty: 0, revenue: 0, cost: 0, profit: 0, returned: 0 },
      ),
    [productStats],
  );

  const allExpenses = adsExpense + opexExpense;
  const netProfit = totals.profit;
  const realProfit = netProfit - allExpenses;
  const margin = totals.revenue > 0 ? (netProfit / totals.revenue) * 100 : 0;
  const realMargin =
    totals.revenue > 0 ? (realProfit / totals.revenue) * 100 : 0;
  const adsActive = adsExpense > 0;

  // Per-product ad spend. Uses the real per-campaign distribution; when the
  // admin overrides the total, the real split is scaled proportionally so the
  // relative weighting between products is preserved. Falls back to revenue
  // share only when there is no campaign data to scale.
  const adByProduct = useMemo(() => {
    const map = new Map<string, number>();
    const realTotal = expenses.totalAdCost;
    if (realTotal > 0) {
      const scale = adsExpense / realTotal;
      for (const a of expenses.adByProduct)
        map.set(a.productId, a.amount * scale);
    } else if (adsExpense > 0 && totals.revenue > 0) {
      for (const p of productStats)
        map.set(p.productId, adsExpense * (p.totalRevenue / totals.revenue));
    }
    return map;
  }, [expenses, adsExpense, productStats, totals.revenue]);

  // ── Products: search + sort ──────────────────────────────────────────────

  const ranked = useMemo(
    () =>
      [...productStats]
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .map((p, i) => ({ ...p, rank: i + 1 })),
    [productStats],
  );

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim();
    let list = q
      ? ranked.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      : ranked;
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name, "ar") * dir;
        if (sortKey === "qty") return (a.totalQty - b.totalQty) * dir;
        if (sortKey === "revenue")
          return (a.totalRevenue - b.totalRevenue) * dir;
        if (sortKey === "profit") return (a.totalProfit - b.totalProfit) * dir;
        return (marginOf(a) - marginOf(b)) * dir;
      });
    }
    return list;
  }, [ranked, searchQuery, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey !== key ? null : sortDir === "asc" ? (
      <ArrowUp className="inline w-3 h-3" />
    ) : (
      <ArrowDown className="inline w-3 h-3" />
    );

  const lowMarginProducts = ranked.filter(
    (p) => p.totalRevenue > 0 && marginOf(p) < 15,
  );

  // ── Cost composition bar (share of what was collected) ───────────────────

  const collected = orderSummary.totalGrossRevenue;
  const deliveryCost = orderSummary.totalActualShippingCost;
  const pctOf = (n: number) => (collected > 0 ? (n / collected) * 100 : 0);
  const composition = [
    {
      label: "تكلفة البضاعة",
      pct: pctOf(totals.cost),
      color: "var(--pa-grey-blue)",
    },
    {
      label: "تكلفة التوصيل",
      pct: pctOf(deliveryCost),
      color: "var(--pa-blue)",
    },
    { label: "المصاريف", pct: pctOf(allExpenses), color: "var(--pa-danger)" },
    {
      label: "صافي الربح",
      pct: pctOf(Math.max(0, realProfit)),
      color: "var(--pa-green)",
    },
  ];

  // ── Chart geometry ───────────────────────────────────────────────────────

  const chart = useMemo(() => {
    const W = 800;
    const H = 260;
    const points = dailySeries;
    if (points.length === 0) return null;

    const isLine = chartMetric === "profit";
    // Net profit is shown cumulatively so the line reads as growth over the
    // period; revenue and orders are per-day magnitudes, so they stay as bars.
    let values: number[];
    if (isLine) {
      const cumulative: number[] = [];
      let run = 0;
      for (const p of points) {
        run += p.profit;
        cumulative.push(run);
      }
      values = cumulative;
    } else if (chartMetric === "revenue") {
      values = points.map((p) => p.revenue);
    } else {
      values = points.map((p) => p.orders);
    }

    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const y = (v: number) => H - 20 - ((v - min) / span) * (H - 40);
    const x = (i: number) =>
      points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;

    const coords = values.map((v, i) => ({ x: x(i), y: y(v) }));
    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");
    const areaPath =
      coords.length > 0
        ? `${linePath} L${W},${H - 20} L0,${H - 20} Z`
        : "";

    const barW = Math.max(2, (W / points.length) * 0.6);
    const bars = values.map((v, i) => {
      const top = y(v);
      return {
        x: x(i) - barW / 2,
        y: top,
        w: barW,
        h: Math.max(1, H - 20 - top),
      };
    });

    // Six evenly spaced x labels (DD/MM), matching the handoff.
    const labelCount = Math.min(6, points.length);
    const labels = Array.from({ length: labelCount }, (_, i) => {
      const idx = Math.round((i / Math.max(1, labelCount - 1)) * (points.length - 1));
      const [, m, d] = points[idx].date.split("-");
      return `${d}/${m}`;
    });

    return { isLine, linePath, areaPath, bars, labels, coords, W, H };
  }, [dailySeries, chartMetric]);

  const chartMeta: Record<ChartMetric, { title: string; sub: string }> = {
    profit: {
      title: "تطوّر صافي الربح",
      sub: "تراكمي عبر أيام الفترة المحددة",
    },
    revenue: { title: "الإيراد اليومي", sub: "الإيراد الصافي لكل يوم" },
    orders: { title: "الطلبات اليومية", sub: "عدد الطلبات المكتملة لكل يوم" },
  };

  // ── Comparison badges vs previous period ─────────────────────────────────

  const comparisonBadges = useMemo(() => {
    if (!comparison) return [];
    const pctDelta = (now: number, before: number) =>
      before === 0 ? null : ((now - before) / Math.abs(before)) * 100;
    return [
      { label: "ما حُصِّل", delta: pctDelta(collected, comparison.collected) },
      {
        label: "صافي الربح",
        delta: pctDelta(realProfit, comparison.netProfit),
      },
      {
        label: "هامش الربح",
        delta: realMargin - comparison.margin,
        isPoints: true,
      },
      {
        label: "عدد الطلبات",
        delta: pctDelta(orderSummary.totalOrderCount, comparison.orders),
      },
    ];
  }, [comparison, collected, realProfit, realMargin, orderSummary]);

  // ── Donut ────────────────────────────────────────────────────────────────

  const donut = useMemo(() => {
    const items = ranked.slice(0, 7).map((p, i) => ({
      name: p.name,
      revenue: p.totalRevenue,
      pct: totals.revenue > 0 ? (p.totalRevenue / totals.revenue) * 100 : 0,
      color: DONUT_PALETTE[i % DONUT_PALETTE.length],
    }));
    const segments: string[] = [];
    let cursor = 0;
    for (const it of items) {
      const start = cursor;
      cursor = start + it.pct;
      segments.push(`${it.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`);
    }
    const stops = segments.join(", ");
    return { items, gradient: stops ? `conic-gradient(${stops})` : "none" };
  }, [ranked, totals.revenue]);

  const insights = useMemo(() => {
    if (ranked.length === 0) return [];
    const top = ranked[0];
    const worst = [...ranked]
      .filter((p) => p.totalRevenue > 0)
      .sort((a, b) => marginOf(a) - marginOf(b))[0];
    const avgPerOrder =
      orderSummary.totalOrderCount > 0
        ? netProfit / orderSummary.totalOrderCount
        : 0;
    return [
      {
        label: "أعلى منتج ربحاً",
        value: top.name,
        meta: `${formatCurrency(top.totalProfit)} صافي ربح`,
        color: "var(--pa-green)",
      },
      {
        label: "أقل هامش ربح",
        value: worst?.name ?? "—",
        meta: worst ? `هامش ${marginOf(worst).toFixed(1)}%` : "—",
        color: "var(--pa-danger)",
      },
      {
        label: "متوسط الربح لكل طلب",
        value: formatCurrency(avgPerOrder),
        meta: `من أصل ${orderSummary.totalOrderCount} طلب`,
        color: "var(--pa-blue)",
      },
    ];
  }, [ranked, netProfit, orderSummary.totalOrderCount]);

  // 13 fixed columns: #, name, qty, returned, revenue, cost, profit, margin,
  // the 4 ad columns, and revenue share.
  const colSpan = 13;

  return (
    <div className={`pa-root ${tajawal.className}`} dir="rtl" lang="ar">
      <div className="pa-inner">
        {/* ── Data integrity warning ───────────────────────────────────── */}
        {inconsistentOrders.length > 0 && (
          <div className="pa-warn">
            <button
              type="button"
              className="pa-warn-toggle"
              onClick={() => setWarnOpen((v) => !v)}
              aria-expanded={warnOpen}
            >
              <span className="pa-warn-icon" aria-hidden>
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="pa-warn-title flex-1 text-right">
                تنبيه: {inconsistentOrders.length} طلب مبلغه لا يطابق أصنافه
              </span>
              <ChevronDown
                className={`w-4 h-4 pa-warn-chevron ${warnOpen ? "pa-warn-chevron--open" : ""}`}
                aria-hidden
              />
            </button>

            {warnOpen && (
              <>
                <div className="pa-meta mt-2 mb-3">
                  المبلغ المُحصَّل يختلف عن (مجموع الأصناف + التوصيل). النظام
                  يعتمد المبلغ المُحصَّل، لذا يُوزَّع الفرق على المنتجات ويرفع أو
                  يخفض سعر بيع الوحدة. غالباً السبب أن الكمية المسجّلة في الطلب
                  أقل من الكمية التي شُحنت فعلاً — وهذا يعني أن التكلفة أقل من
                  الحقيقة والمخزون أعلى من الحقيقة.
                </div>
                <div className="flex flex-col gap-2">
                  {inconsistentOrders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/order/${o.id}`}
                      className="pa-warn-row"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-bold">{o.items}</span>
                        <span className="pa-meta"> · {o.date}</span>
                      </span>
                      <span className="pa-meta whitespace-nowrap">
                        متوقع {formatCurrency(o.expected)} ← فعلي{" "}
                        {formatCurrency(o.actual)}
                      </span>
                      <span
                        className="font-extrabold whitespace-nowrap"
                        style={{ color: "var(--pa-warn-fg)" }}
                      >
                        {o.diff > 0 ? "+" : ""}
                        {formatCurrency(o.diff)}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Insights ─────────────────────────────────────────────────── */}
        {insights.length > 0 && (
          <div className="pa-grid">
            {insights.map((ins) => (
              <div key={ins.label} className="pa-insight">
                <span
                  className="pa-dot"
                  style={{ background: ins.color }}
                  aria-hidden
                />
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="pa-sub">{ins.label}</div>
                  <div className="pa-insight-value">{ins.value}</div>
                  <div className="pa-meta truncate">{ins.meta}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── KPI row 1 + composition ──────────────────────────────────── */}
        <div>
          <div className="pa-section-title">ملخّص الإيرادات والتكاليف</div>
          <div className="pa-grid">
            <Kpi
              label="إجمالي ما حُصِّل"
              value={formatCurrency(collected)}
              meta={`من ${orderSummary.totalOrderCount} طلب مكتمل`}
            />
            <Kpi
              label="تكلفة التوصيل الفعلية"
              value={formatCurrency(deliveryCost)}
              meta={`بغداد: ${formatCurrency(orderSummary.baghdadActualShippingCost)} | غيرها: ${formatCurrency(orderSummary.othersActualShippingCost)}`}
            />
            <Kpi
              label="تكلفة البضاعة"
              value={formatCurrency(totals.cost)}
              meta={`${totals.qty} قطعة مباعة`}
            />
            <Kpi
              label="صافي الربح"
              value={formatCurrency(netProfit)}
              meta={`هامش الربح: ${margin.toFixed(1)}%`}
              emphasize
            />
          </div>

          <div className="mt-4">
            <div className="pa-comp-track">
              {composition.map((c) => (
                <div
                  key={c.label}
                  style={{
                    width: `${Math.max(0, c.pct)}%`,
                    background: c.color,
                  }}
                />
              ))}
            </div>
            <div className="flex gap-4 flex-wrap mt-2">
              {composition.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-1.5 pa-meta"
                >
                  <span
                    className="pa-legend-dot"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  {c.label} · {c.pct.toFixed(1)}%
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Expenses (editable) ──────────────────────────────────────── */}
        <div>
          <div className="pa-section-title">
            المصاريف{" "}
            <span className="font-normal pa-meta">
              — القيم من قاعدة البيانات؛ يمكنك تعديلها مؤقتاً لتجربة سيناريو (لا
              تُحفظ)
            </span>
          </div>
          <div className="pa-grid">
            <div className="pa-kpi">
              <div className="pa-sub">مصاريف الإعلانات</div>
              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  min={0}
                  className="pa-expense-input"
                  value={adsExpense}
                  onChange={(e) =>
                    setAdsExpense(
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                  aria-label="مصاريف الإعلانات"
                />
              </div>
              <div className="pa-meta">
                {formatCurrency(adsExpense)} ·{" "}
                {expenses.adByProduct.length} منتج معلن
              </div>
            </div>

            <div className="pa-kpi">
              <div className="pa-sub">المصاريف التشغيلية</div>
              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  min={0}
                  className="pa-expense-input"
                  value={opexExpense}
                  onChange={(e) =>
                    setOpexExpense(
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                  aria-label="المصاريف التشغيلية"
                />
              </div>
              <div className="pa-meta">
                {formatCurrency(opexExpense)} ·{" "}
                {expenses.expenseByCategory.length} تصنيف
              </div>
            </div>

            <Kpi
              label="إجمالي المصاريف"
              value={formatCurrency(allExpenses)}
              meta="إعلانات + تشغيلية"
            />
            <Kpi
              label="صافي الربح الحقيقي"
              value={formatCurrency(realProfit)}
              meta={`هامش حقيقي: ${realMargin.toFixed(1)}%`}
              emphasize
            />
          </div>
        </div>

        {/* ── Low margin alert ─────────────────────────────────────────── */}
        {lowMarginProducts.length > 0 && (
          <div className="pa-alert">
            <div className="flex items-center gap-2.5">
              <span className="pa-alert-icon" aria-hidden>
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <div className="pa-alert-title">
                تنبيه: منتجات بهامش ربح منخفض (أقل من 15%)
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-2.5">
              {lowMarginProducts.map((p) => (
                <div
                  key={p.productId}
                  className="flex justify-between text-sm px-8"
                  style={{ color: "var(--pa-text-primary)" }}
                >
                  <span>{p.name}</span>
                  <span
                    className="font-extrabold"
                    style={{ color: "var(--pa-danger)" }}
                  >
                    هامش {marginOf(p).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Chart ────────────────────────────────────────────────────── */}
        <div className="pa-panel">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="pa-panel-title">
                {chartMeta[chartMetric].title}
              </div>
              <div className="pa-sub">{chartMeta[chartMetric].sub}</div>
            </div>
            {comparisonBadges.length > 0 && (
              <div className="flex gap-2.5 flex-wrap">
                {comparisonBadges.map((c) => {
                  const up = (c.delta ?? 0) >= 0;
                  return (
                    <div
                      key={c.label}
                      className="rounded-xl px-3 py-2"
                      style={{
                        background: "var(--pa-bg-page)",
                        border: "1px solid var(--pa-border)",
                      }}
                    >
                      <div className="pa-meta">{c.label}</div>
                      <div
                        className="text-sm font-extrabold"
                        style={{
                          color:
                            c.delta === null
                              ? "var(--pa-text-muted)"
                              : up
                                ? "var(--pa-green-value)"
                                : "var(--pa-danger)",
                        }}
                      >
                        {c.delta === null
                          ? "—"
                          : `${up ? "▲" : "▼"} ${Math.abs(c.delta).toFixed(1)}${
                              c.isPoints ? " نقطة" : "%"
                            }`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            {(
              [
                ["profit", "صافي الربح"],
                ["revenue", "الإيراد"],
                ["orders", "الطلبات"],
              ] as [ChartMetric, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChartMetric(key)}
                className={`pa-tab ${chartMetric === key ? "pa-tab--active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {chart ? (
            <div className="mt-3.5">
              <svg
                viewBox={`0 0 ${chart.W} ${chart.H}`}
                style={{ width: "100%", height: 240, display: "block" }}
                role="img"
                aria-label={chartMeta[chartMetric].title}
              >
                <defs>
                  <linearGradient id="paAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="oklch(0.72 0.15 155)"
                      stopOpacity="0.35"
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(0.72 0.15 155)"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((i) => {
                  const y = 20 + i * ((chart.H - 40) / 3);
                  return (
                    <line
                      key={i}
                      x1="0"
                      x2={chart.W}
                      y1={y}
                      y2={y}
                      stroke="var(--pa-grid-line)"
                      strokeWidth="1"
                    />
                  );
                })}
                {chart.isLine ? (
                  <>
                    <path d={chart.areaPath} fill="url(#paAreaGrad)" />
                    <path
                      d={chart.linePath}
                      fill="none"
                      stroke="oklch(0.72 0.15 155)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {chart.coords.length > 0 && (
                      <circle
                        cx={chart.coords[chart.coords.length - 1].x}
                        cy={chart.coords[chart.coords.length - 1].y}
                        r="5"
                        fill="oklch(0.72 0.15 155)"
                        stroke="var(--pa-bg-panel)"
                        strokeWidth="3"
                      />
                    )}
                  </>
                ) : (
                  chart.bars.map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx="3"
                      fill="oklch(0.72 0.15 155)"
                    />
                  ))
                )}
              </svg>
              <div className="flex justify-between mt-2">
                {chart.labels.map((l, i) => (
                  <span key={i} className="pa-meta" style={{ fontSize: 11 }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="pa-sub py-10 text-center">
              لا توجد بيانات لعرضها في هذه الفترة
            </div>
          )}
        </div>

        {/* ── Orders distribution ──────────────────────────────────────── */}
        <div>
          <div className="pa-section-title">توزيع الطلبات والتوصيل</div>
          <div className="pa-grid-wide">
            <DistributionCard
              title="طلبات بغداد"
              orders={orderSummary.baghdadOrderCount}
              total={orderSummary.totalOrderCount}
              cost={orderSummary.baghdadActualShippingCost}
              color="var(--pa-green)"
            />
            <DistributionCard
              title="طلبات باقي المحافظات"
              orders={orderSummary.othersOrderCount}
              total={orderSummary.totalOrderCount}
              cost={orderSummary.othersActualShippingCost}
              color="var(--pa-grey-blue)"
            />
            <div className="pa-panel">
              <div className="pa-panel-title">إجمالي تكلفة التوصيل</div>
              <div className="pa-big-value">{formatCurrency(deliveryCost)}</div>
              <div className="pa-sub">
                مُدمجة ضمن الإيراد الصافي للمنتجات ولا تُحتسب مرة أخرى
              </div>
            </div>
          </div>
        </div>

        {/* ── Revenue share donut ──────────────────────────────────────── */}
        {donut.items.length > 0 && (
          <div>
            <div className="pa-section-title">توزيع الإيراد على المنتجات</div>
            <div className="pa-panel flex items-center gap-8 flex-wrap">
              <div className="pa-donut-wrap">
                <div
                  className="pa-donut"
                  style={{ background: donut.gradient }}
                  aria-hidden
                />
                <div className="pa-donut-hole">
                  <div className="text-[15px] font-extrabold">
                    {formatCurrency(totals.revenue)}
                  </div>
                  <div className="pa-meta" style={{ fontSize: 11 }}>
                    إجمالي الإيراد الصافي
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-[240px] grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                {donut.items.map((d) => (
                  <div key={d.name} className="flex items-center gap-2.5">
                    <span
                      className="pa-legend-dot"
                      style={{ background: d.color }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate">
                        {d.name}
                      </div>
                      <div className="pa-meta" style={{ fontSize: 11 }}>
                        {formatCurrency(d.revenue)} · {d.pct.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Products table ───────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div className="pa-section-title">تفصيل المنتجات</div>
            <div className="pa-sub">
              الإيراد = ما حُصِّل − تكلفة التوصيل الفعلية، موزَّع نسبياً
              {fefoActive && " · التكلفة محسوبة حسب الدفعات (الأقدم أولاً)"}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <input
              type="text"
              className="pa-search"
              placeholder="بحث عن منتج…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="بحث عن منتج"
            />
            <div className="flex items-center gap-2 flex-wrap">
              {fefoActive && fefoFallbackQty > 0 && (
                <span className="pa-badge pa-badge--danger">
                  {fefoFallbackQty} قطعة بلا دفعة (تكلفة أساسية)
                </span>
              )}
              <div className="pa-sub">
                {visibleProducts.length} من {ranked.length} منتج
              </div>
            </div>
          </div>

          <div className="pa-table-wrap">
            <table className="pa-table" style={{ minWidth: 1220 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th
                    className="pa-th-sort"
                    style={{ textAlign: "right" }}
                    onClick={() => toggleSort("name")}
                  >
                    المنتج {sortArrow("name")}
                  </th>
                  <th className="pa-th-sort" onClick={() => toggleSort("qty")}>
                    الكمية {sortArrow("qty")}
                  </th>
                  <th>الراجع</th>
                  <th
                    className="pa-th-sort"
                    onClick={() => toggleSort("revenue")}
                  >
                    الإيراد الصافي {sortArrow("revenue")}
                  </th>
                  <th>تكلفة البضاعة</th>
                  <th
                    className="pa-th-sort"
                    onClick={() => toggleSort("profit")}
                  >
                    صافي الربح {sortArrow("profit")}
                  </th>
                  <th
                    className="pa-th-sort"
                    onClick={() => toggleSort("margin")}
                  >
                    هامش الربح {sortArrow("margin")}
                  </th>
                  <th>مصاريف الإعلان</th>
                  <th>إعلان / طلب</th>
                  <th>الربح بعد الإعلان</th>
                  <th>هامش بعد الإعلان</th>
                  <th>% من الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="py-12">
                      لا توجد نتائج
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map((p) => {
                    const m = marginOf(p);
                    const adCost = adByProduct.get(p.productId) ?? 0;
                    const profitAfterAds = p.totalProfit - adCost;
                    const marginAfterAds =
                      p.totalRevenue > 0
                        ? (profitAfterAds / p.totalRevenue) * 100
                        : 0;
                    const share =
                      totals.revenue > 0
                        ? (p.totalRevenue / totals.revenue) * 100
                        : 0;
                    const isOpen = expandedId === p.productId;
                    const rankClass =
                      p.rank === 1
                        ? "pa-rank--gold"
                        : p.rank === 2
                          ? "pa-rank--silver"
                          : p.rank === 3
                            ? "pa-rank--bronze"
                            : "";
                    return (
                      <Fragment key={p.productId}>
                        <tr
                          className={`pa-row ${isOpen ? "pa-row--expanded" : ""}`}
                          onClick={() =>
                            setExpandedId(isOpen ? null : p.productId)
                          }
                        >
                          <td>
                            <span className={`pa-rank ${rankClass}`}>
                              {p.rank}
                            </span>
                          </td>
                          <td className="pa-name-cell">
                            <span className="inline-flex items-center gap-1.5">
                              {isOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                              ) : (
                                <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                              )}
                              {p.name}
                            </span>
                          </td>
                          <td>{p.totalQty}</td>
                          <td>
                            {p.returnedQty > 0 ? (
                              <span style={{ color: "var(--pa-danger)" }}>
                                {p.returnedQty} (
                                {(
                                  (p.returnedQty /
                                    (p.totalQty + p.returnedQty)) *
                                  100
                                ).toFixed(1)}
                                %)
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{formatCurrency(p.totalRevenue)}</td>
                          <td>{formatCurrency(p.totalCost)}</td>
                          <td className="pa-profit-cell">
                            {formatCurrency(p.totalProfit)}
                          </td>
                          <td>
                            <span
                              className={`pa-badge ${m >= 15 ? "pa-badge--green" : "pa-badge--danger"}`}
                            >
                              {m.toFixed(1)}%
                            </span>
                          </td>
                          {/* Ad columns stay visible even with no ad spend, so
                              the table shape never shifts; they read "—" until a
                              campaign covers the product. */}
                          <td>{adCost > 0 ? formatCurrency(adCost) : "—"}</td>
                          <td>
                            {adCost > 0 && p.orderCount > 0
                              ? formatCurrency(adCost / p.orderCount)
                              : "—"}
                          </td>
                          <td
                            style={
                              adCost > 0
                                ? {
                                    color:
                                      profitAfterAds >= 0
                                        ? "var(--pa-green-value)"
                                        : "var(--pa-danger)",
                                    fontWeight: 700,
                                  }
                                : undefined
                            }
                          >
                            {adCost > 0 ? formatCurrency(profitAfterAds) : "—"}
                          </td>
                          <td>
                            {adCost > 0 ? (
                              <span
                                className={`pa-badge ${marginAfterAds >= 15 ? "pa-badge--green" : "pa-badge--danger"}`}
                              >
                                {marginAfterAds.toFixed(1)}%
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <div className="flex items-center gap-2 justify-center">
                              <div className="pa-bar-track--sm">
                                <div
                                  className="pa-bar-fill"
                                  style={{
                                    width: `${Math.min(share, 100)}%`,
                                    background: "var(--pa-green)",
                                  }}
                                />
                              </div>
                              <span className="min-w-[32px]">
                                {share.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={colSpan} className="pa-detail-cell">
                              <div className="pa-detail-grid">
                                <Detail
                                  label="سعر بيع الوحدة (صافي)"
                                  value={formatCurrency(
                                    p.totalQty > 0
                                      ? p.totalRevenue / p.totalQty
                                      : 0,
                                  )}
                                />
                                <Detail
                                  label="تكلفة الوحدة"
                                  value={formatCurrency(
                                    p.totalQty > 0 ? p.totalCost / p.totalQty : 0,
                                  )}
                                />
                                <Detail
                                  label="ربح الوحدة"
                                  value={formatCurrency(
                                    p.totalQty > 0
                                      ? p.totalProfit / p.totalQty
                                      : 0,
                                  )}
                                  green
                                />
                                <Detail
                                  label="القطع المباعة"
                                  value={String(p.totalQty)}
                                />
                                <Detail
                                  label="الراجع"
                                  value={String(p.returnedQty)}
                                />
                              </div>
                              <div className="pa-meta mt-2.5">
                                التكلفة محسوبة حسب الدفعات (الأقدم أولاً) — FIFO.
                                الإيراد الصافي موزّع نسبياً بعد خصم تكلفة التوصيل
                                الفعلية.
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>—</td>
                  <td style={{ textAlign: "right" }}>المجموع</td>
                  <td>{totals.qty}</td>
                  <td>
                    {totals.returned > 0
                      ? `${totals.returned} (${(
                          (totals.returned / (totals.qty + totals.returned)) *
                          100
                        ).toFixed(1)}%)`
                      : "—"}
                  </td>
                  <td>{formatCurrency(totals.revenue)}</td>
                  <td>{formatCurrency(totals.cost)}</td>
                  <td style={{ color: "var(--pa-green-value)" }}>
                    {formatCurrency(netProfit)}
                  </td>
                  <td>{margin.toFixed(1)}%</td>
                  <td>{adsActive ? formatCurrency(adsExpense) : "—"}</td>
                  <td>—</td>
                  <td
                    style={
                      adsActive ? { color: "var(--pa-green-value)" } : undefined
                    }
                  >
                    {adsActive ? formatCurrency(netProfit - adsExpense) : "—"}
                  </td>
                  <td>
                    {adsActive && totals.revenue > 0
                      ? `${(((netProfit - adsExpense) / totals.revenue) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="pa-meta mt-2.5 px-1">
            {adsActive
              ? "مصاريف الإعلان موزّعة على المنتجات حسب حملات الإعلان الفعلية."
              : "لا توجد مصاريف إعلان في هذه الفترة — أدخل مبلغاً أعلاه لعرض أعمدة تحليل الإعلان."}
          </div>
        </div>
      </div>

      {/* ── Sticky summary footer ──────────────────────────────────────── */}
      <div className="pa-footer pa-no-print">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-7 flex-wrap">
            <div>
              <div className="pa-footer-label">إجمالي ما حُصِّل</div>
              <div className="pa-footer-value">{formatCurrency(collected)}</div>
            </div>
            <div>
              <div className="pa-footer-label">
                إجمالي التكاليف (توصيل + بضاعة + مصاريف)
              </div>
              <div className="pa-footer-value">
                {formatCurrency(deliveryCost + totals.cost + allExpenses)}
              </div>
            </div>
            <div>
              <div className="pa-footer-label">صافي الربح الحقيقي</div>
              <div
                className="pa-footer-value"
                style={{ color: "var(--pa-green-value)" }}
              >
                {formatCurrency(realProfit)}
              </div>
            </div>
            <div>
              <div className="pa-footer-label">هامش الربح الحقيقي</div>
              <div
                className="pa-footer-value"
                style={{ color: "var(--pa-green-value)" }}
              >
                {realMargin.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small presentational helpers ───────────────────────────────────────────

function Kpi({
  label,
  value,
  meta,
  emphasize,
}: {
  label: string;
  value: string;
  meta: string;
  emphasize?: boolean;
}) {
  return (
    <div className={`pa-kpi ${emphasize ? "pa-kpi--emph" : ""}`}>
      <div className="pa-kpi-label">{label}</div>
      <div className="pa-kpi-value">{value}</div>
      <div className="pa-meta">{meta}</div>
    </div>
  );
}

function Detail({
  label,
  value,
  green,
}: {
  label: string;
  value: string;
  green?: boolean;
}) {
  return (
    <div className="pa-detail-item">
      <div className="pa-detail-label">{label}</div>
      <div
        className="pa-detail-value"
        style={green ? { color: "var(--pa-green-value)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function DistributionCard({
  title,
  orders,
  total,
  cost,
  color,
}: {
  title: string;
  orders: number;
  total: number;
  cost: number;
  color: string;
}) {
  const pct = total > 0 ? (orders / total) * 100 : 0;
  return (
    <div className="pa-panel">
      <div className="flex items-center justify-between">
        <div className="pa-panel-title">{title}</div>
        <span className="pa-badge pa-badge--green">{pct.toFixed(0)}%</span>
      </div>
      <div className="pa-big-value">{orders} طلب</div>
      <div className="pa-bar-track">
        <div
          className="pa-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="pa-sub">تكلفة توصيل: {formatCurrency(cost)}</div>
    </div>
  );
}
