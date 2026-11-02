import { formatCurrency } from "@/lib/utils";
import { roundForDisplay, type ImportSignal } from "@/lib/import-calc";
import type { ImportStatus } from "@/lib/import-status";

/** مبلغ بوحدة الألف د.ع مقرَّباً لأقرب 250 د.ع — للعرض فقط. */
export function fmtK(kiqd: number | null | undefined) {
  if (kiqd === null || kiqd === undefined || !Number.isFinite(kiqd)) return "—";
  return formatCurrency(roundForDisplay(kiqd));
}

/** مبلغ صغير بدقة الدينار (للتغليف وما شابه). */
export function fmtKExact(kiqd: number | null | undefined) {
  if (kiqd === null || kiqd === undefined || !Number.isFinite(kiqd)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(kiqd * 1000)} د.ع`;
}

export function fmtUsd(usd: number | null | undefined) {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd)}`;
}

export function fmtPct(pct: number | null | undefined, digits = 1) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(digits)}٪`;
}

export function fmtNum(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);
}

export const SIGNAL_STYLES: Record<ImportSignal, { dot: string; chip: string; label: string }> = {
  green: {
    dot: "bg-green-500",
    chip: "bg-green-500/15 text-green-700 dark:text-green-400",
    label: "مربح وآمن",
  },
  yellow: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    label: "مربح بحذر",
  },
  red: {
    dot: "bg-red-500",
    chip: "bg-red-500/15 text-red-700 dark:text-red-400",
    label: "خاسر",
  },
};

export const STATUS_STYLES: Record<ImportStatus, string> = {
  idea: "bg-muted text-muted-foreground",
  studying: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  approved: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  ordered: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  shipping: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  arrived: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  converted: "bg-green-500/15 text-green-700 dark:text-green-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function profitTone(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}
