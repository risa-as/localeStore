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
    totalGrossRevenue: number;
    totalActualShippingCost: number;
    totalOrderCount: number;
    baghdadOrderCount: number;
    othersOrderCount: number;
    baghdadActualShippingCost: number;
    othersActualShippingCost: number;
  };
  totalCost: number;
  totalAdCost: number;
  totalExpenses: number;
  trueNetProfit: number;
}

export default function ProfitExportButton({
  productStats,
  adByProduct,
  from,
  to,
  summary,
  totalCost,
  totalAdCost,
  totalExpenses,
  trueNetProfit,
}: ProfitExportButtonProps) {
  const handleExport = () => {
    const adMap = new Map(adByProduct.map((a) => [a.productId, a.amount]));

    // Sheet 1: Product breakdown
    const productRows = productStats.map((item, i) => {
      const margin =
        item.totalRevenue > 0
          ? ((item.totalProfit / item.totalRevenue) * 100).toFixed(1) + "%"
          : "0%";
      const adCost = adMap.get(item.productId) ?? 0;
      const profitAfterAd = item.totalProfit - adCost;
      return {
        "#": i + 1,
        المنتج: item.name,
        الكمية: item.totalQty,
        "الإيراد الصافي (د.ع)": item.totalRevenue,
        "تكلفة البضاعة (د.ع)": item.totalCost,
        "صافي الربح (د.ع)": item.totalProfit,
        "هامش الربح": margin,
        "مصاريف الإعلان (د.ع)": adCost > 0 ? adCost : "",
        "الربح بعد الإعلان (د.ع)": adCost > 0 ? profitAfterAd : "",
      };
    });

    // Totals row
    const totalQty = productStats.reduce((s, p) => s + p.totalQty, 0);
    const totalRevenue = productStats.reduce((s, p) => s + p.totalRevenue, 0);
    const netProfit = productStats.reduce((s, p) => s + p.totalProfit, 0);
    const overallMargin =
      totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) + "%" : "0%";

    productRows.push({
      "#": "",
      المنتج: "المجموع",
      الكمية: totalQty,
      "الإيراد الصافي (د.ع)": totalRevenue,
      "تكلفة البضاعة (د.ع)": totalCost,
      "صافي الربح (د.ع)": netProfit,
      "هامش الربح": overallMargin,
      "مصاريف الإعلان (د.ع)": totalAdCost > 0 ? totalAdCost : "",
      "الربح بعد الإعلان (د.ع)": totalAdCost > 0 ? netProfit - totalAdCost : "",
    } as any);

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

    // Sheet 2: Summary
    const summaryRows = [
      { البيان: "الفترة", القيمة: `${from} → ${to}` },
      { البيان: "", القيمة: "" },
      { البيان: "إجمالي الطلبات المكتملة", القيمة: summary.totalOrderCount },
      { البيان: "إجمالي ما حُصِّل (د.ع)", القيمة: summary.totalGrossRevenue },
      { البيان: "تكلفة التوصيل الفعلية (د.ع)", القيمة: summary.totalActualShippingCost },
      { البيان: "تكلفة البضاعة (د.ع)", القيمة: totalCost },
      { البيان: "صافي الربح قبل المصاريف (د.ع)", القيمة: netProfit },
      { البيان: "", القيمة: "" },
      { البيان: "مصاريف الإعلانات (د.ع)", القيمة: totalAdCost },
      { البيان: "المصاريف التشغيلية (د.ع)", القيمة: totalExpenses },
      { البيان: "إجمالي المصاريف (د.ع)", القيمة: totalAdCost + totalExpenses },
      { البيان: "", القيمة: "" },
      { البيان: "صافي الربح الحقيقي (د.ع)", القيمة: trueNetProfit },
      { البيان: "", القيمة: "" },
      { البيان: "طلبات بغداد", القيمة: summary.baghdadOrderCount },
      { البيان: "تكلفة توصيل بغداد (د.ع)", القيمة: summary.baghdadActualShippingCost },
      { البيان: "طلبات باقي المحافظات", القيمة: summary.othersOrderCount },
      { البيان: "تكلفة توصيل المحافظات (د.ع)", القيمة: summary.othersActualShippingCost },
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
