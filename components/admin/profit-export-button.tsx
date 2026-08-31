"use client";

import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

interface ProductStat {
  productId: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
}

interface ProfitExportButtonProps {
  productStats: ProductStat[];
  adByProduct: { productId: string; name: string; amount: number }[];
  from: string;
  to: string;
  summary: {
    totalOrderCount: number;
    baghdadOrderCount: number;
    othersOrderCount: number;
    totalGrossRevenue: number;
    totalActualShippingCost: number;
    baghdadActualShippingCost: number;
    othersActualShippingCost: number;
  };
  /** قيم ما-لو الحيّة المعروضة على الشاشة (بوحدة الألف د.ع). */
  totals: { qty: number; revenue: number; cost: number; profit: number; returned: number };
  adsExpense: number;
  opexExpense: number;
  trueNetProfit: number;
}

/**
 * زر تصدير Excel — يُستدعى من داخل لوحة الأرباح بقيم ما-لو الحيّة، فالملف
 * يطابق الشاشة تماماً حتى بعد تعديل المصاريف مؤقتاً. كل المبالغ تُحوَّل من
 * وحدة «الألف د.ع» المخزّنة إلى الدينار الكامل في الملف.
 */
export default function ProfitExportButton({
  productStats,
  adByProduct,
  from,
  to,
  summary,
  totals,
  adsExpense,
  opexExpense,
  trueNetProfit,
}: ProfitExportButtonProps) {
  const handleExport = () => {
    const adMap = new Map(adByProduct.map((a) => [a.productId, a.amount]));
    const toIQD = (v: number) => Math.round(v * 1000);

    // Sheet 1: Product breakdown — بقيم ما-لو المعروضة.
    type ProductRow = {
      "#": number | string;
      المنتج: string;
      الكمية: number;
      "الإيراد الصافي (د.ع)": number;
      "تكلفة البضاعة (د.ع)": number;
      "صافي الربح (د.ع)": number;
      "هامش الربح": string;
      "مصاريف الإعلان (د.ع)": number | string;
      "الربح بعد الإعلان (د.ع)": number | string;
    };
    const dbRevenue = productStats.reduce((s, p) => s + p.totalRevenue, 0);
    const revScale = dbRevenue > 0 ? totals.revenue / dbRevenue : 1;
    const dbProfit = productStats.reduce((s, p) => s + p.totalProfit, 0);
    const profitScale = dbProfit > 0 ? totals.profit / dbProfit : 1;

    const productRows: ProductRow[] = productStats.map((item, i) => {
      const margin =
        item.totalRevenue > 0
          ? ((item.totalProfit / item.totalRevenue) * 100).toFixed(1) + "%"
          : "0%";
      const adCost = adMap.get(item.productId) ?? 0;
      const scaledProfit = item.totalProfit * profitScale;
      const profitAfterAd = scaledProfit - adCost;
      return {
        "#": i + 1,
        المنتج: item.name,
        الكمية: item.totalQty,
        "الإيراد الصافي (د.ع)": toIQD(item.totalRevenue * revScale),
        "تكلفة البضاعة (د.ع)": toIQD(
          item.totalRevenue * revScale - scaledProfit,
        ),
        "صافي الربح (د.ع)": toIQD(scaledProfit),
        "هامش الربح": margin,
        "مصاريف الإعلان (د.ع)": adCost > 0 ? toIQD(adCost) : "",
        "الربح بعد الإعلان (د.ع)": adCost > 0 ? toIQD(profitAfterAd) : "",
      };
    });

    const totalRow: ProductRow = {
      "#": "",
      المنتج: "المجموع",
      الكمية: totals.qty,
      "الإيراد الصافي (د.ع)": toIQD(totals.revenue),
      "تكلفة البضاعة (د.ع)": toIQD(totals.cost),
      "صافي الربح (د.ع)": toIQD(totals.profit),
      "هامش الربح":
        totals.revenue > 0
          ? ((totals.profit / totals.revenue) * 100).toFixed(1) + "%"
          : "0%",
      "مصاريف الإعلان (د.ع)": adsExpense > 0 ? toIQD(adsExpense) : "",
      "الربح بعد الإعلان (د.ع)":
        adsExpense > 0 ? toIQD(totals.profit - adsExpense) : "",
    };
    productRows.push(totalRow);

    const ws1 = XLSX.utils.json_to_sheet(productRows);
    ws1["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 10 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 14 },
      { wch: 22 },
      { wch: 24 },
    ];

    // Sheet 2: Summary — بقيم ما-لو أيضاً.
    const summaryRows = [
      { البيان: "الفترة", القيمة: `${from} → ${to}` },
      { البيان: "", القيمة: "" },
      { البيان: "إجمالي الطلبات المكتملة", القيمة: summary.totalOrderCount },
      { البيان: "إجمالي ما حُصِّل (د.ع)", القيمة: toIQD(summary.totalGrossRevenue) },
      { البيان: "تكلفة التوصيل الفعلية (د.ع)", القيمة: toIQD(summary.totalActualShippingCost) },
      { البيان: "تكلفة البضاعة (د.ع)", القيمة: toIQD(totals.cost) },
      { البيان: "صافي الربح قبل المصاريف (د.ع)", القيمة: toIQD(totals.profit) },
      { البيان: "", القيمة: "" },
      { البيان: "مصاريف الإعلانات (د.ع)", القيمة: toIQD(adsExpense) },
      { البيان: "المصاريف التشغيلية (د.ع)", القيمة: toIQD(opexExpense) },
      { البيان: "إجمالي المصاريف (د.ع)", القيمة: toIQD(adsExpense + opexExpense) },
      { البيان: "", القيمة: "" },
      { البيان: "صافي الربح الحقيقي (د.ع)", القيمة: toIQD(trueNetProfit) },
      { البيان: "", القيمة: "" },
      { البيان: "طلبات بغداد", القيمة: summary.baghdadOrderCount },
      { البيان: "تكلفة توصيل بغداد (د.ع)", القيمة: toIQD(summary.baghdadActualShippingCost) },
      { البيان: "طلبات باقي المحافظات", القيمة: summary.othersOrderCount },
      { البيان: "تكلفة توصيل المحافظات (د.ع)", القيمة: toIQD(summary.othersActualShippingCost) },
    ];

    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2["!cols"] = [{ wch: 38 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "تفصيل المنتجات");
    XLSX.utils.book_append_sheet(wb, ws2, "الملخص");

    XLSX.writeFile(wb, `profit-${from}-to-${to}.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
      <FileSpreadsheet className="w-4 h-4" />
      تصدير Excel
    </Button>
  );
}
