import { AlertTriangle, Scale } from "lucide-react";
import type { ComparisonRow, ImportComparison } from "@/lib/actions/import.actions";
import { cn } from "@/lib/utils";
import { fmtK, fmtNum, fmtPct } from "./format";

function fmt(v: number | null, unit: ComparisonRow["unit"]) {
  if (v === null) return "—";
  return unit === "kiqd" ? fmtK(v) : unit === "pct" ? fmtPct(v) : fmtNum(v);
}

/** الفرق لصالحك أم ضدك: التكلفة والإعلان أقل = أفضل، والباقي أعلى = أفضل. */
function diffTone(row: ComparisonRow) {
  if (row.expected === null || row.actual === null) return "";
  const lowerIsBetter = row.key === "landed" || row.key === "ad";
  const better = lowerIsBetter ? row.actual <= row.expected : row.actual >= row.expected;
  return better ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

function diffText(row: ComparisonRow) {
  if (row.expected === null || row.actual === null) return "";
  const d = row.actual - row.expected;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  if (row.unit === "pct") return `${sign}${Math.abs(d).toFixed(1)} نقطة`;
  return `${sign}${fmt(Math.abs(d), row.unit)}`;
}

export default function ImportComparisonCard({ data }: { data: ImportComparison }) {
  return (
    <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Scale className="h-4 w-4" />
          المتوقع مقابل الفعلي
        </h2>
        <p className="text-xs text-muted-foreground">
          منذ الوصول {data.since} · {data.days} يوم
        </p>
      </div>

      {data.warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {w.text}
        </p>
      ))}
      {data.lowConfidence && (
        <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
          الطلبات منذ الوصول ما زالت قليلة — الأرقام الفعلية ستستقر مع الوقت.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium" />
              <th className="py-2 text-center font-medium">المتوقع (اللقطة)</th>
              <th className="py-2 text-center font-medium">الفعلي</th>
              <th className="py-2 text-center font-medium">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key} className={cn("border-b last:border-0", row.key === "profit" && "font-semibold")}>
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-center">{fmt(row.expected, row.unit)}</td>
                <td className="py-2 text-center">{fmt(row.actual, row.unit)}</td>
                <td className={cn("py-2 text-center text-xs", diffTone(row))} dir="ltr">
                  {diffText(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.soldFromBatch !== null && (
        <div className="grid grid-cols-3 gap-3 border-t pt-3 text-center">
          <div>
            <p className="text-[11px] text-muted-foreground">كمية الدفعة</p>
            <p className="font-semibold">{fmtNum(data.batchQty)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">خرج منها</p>
            <p className="font-semibold">{fmtNum(data.soldFromBatch)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">المتبقي</p>
            <p className="font-semibold">{fmtNum(data.batchRemaining)}</p>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        الفعلي محسوب بنفس منطق صفحة الأرباح للطلبات المنشأة منذ يوم الوصول، والربح الفعلي = صافي سعر البيع − التكلفة الواصلة الفعلية − الإعلان لكل قطعة مسلَّمة.
      </p>
    </section>
  );
}
