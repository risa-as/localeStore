"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAllOrdersForExport } from "@/lib/actions/order.actions";
import { formatDateTime } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Loader2, Download } from "lucide-react";
import { useTranslations } from "next-intl";

export default function OrdersExportButton({
    query,
    status,
}: {
    query: string;
    status: string;
}) {
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Admin');
    const tGov = useTranslations('Governorates');

    const handleExport = async () => {
        try {
            setLoading(true);
            const orders = await getAllOrdersForExport({ query, status });

            const data = orders.map((order: any) => ({
                "اسم الزبون": order.fullName,
                "رقم الهاتف الاساسي": order.phoneNumber,
                "رقم الهاتف الثانوي": order.phoneNumber,
                "المحافظة": tGov(order.governorate as any),
                "المنطقة": order.address,
                "نوع البضاعه": order.orderitems.map((item: any) => `${item.name}`).join(", "),
                "عدد القطع": order.orderitems[0]?.qty,
                "السعر مع التوصيل": order.totalPrice * 1000,
                "حجم الطلب": "عادي",
                "الملاحظات": order.notes || "",
                "نوع الطلب": "طلب جديد",
            }));

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

            XLSX.writeFile(workbook, `Orders_${formatDateTime(new Date()).dateOnly}.xlsx`);
        } catch (error) {
            console.error("Export failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button variant="outline" onClick={handleExport} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t('exportExcel')}
        </Button>
    );
}
