"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import * as XLSX from "xlsx";
import { importOrders } from "@/lib/actions/order.actions";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

export default function OrdersImportButton() {
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Admin');
    const { toast } = useToast();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            // Sanitize data to plain objects
            const plainData = JSON.parse(JSON.stringify(jsonData));

            // Send data to server action
            const result = await importOrders(plainData);

            if (result.success) {
                toast({
                    title: t("importedSuccessfully"),
                    description: `${result.count} ${t("ordersImported")}`,
                });
                // Relaxed refresh
                router.refresh();
            } else {
                toast({
                    variant: "destructive",
                    title: t("importFailed"),
                    description: result.message,
                });
            }
        } catch (error) {
            console.error("Import error:", error);
            toast({
                variant: "destructive",
                title: t("importFailed"),
                description: t("invalidFile"),
            });
        } finally {
            setLoading(false);
            // Reset input
            e.target.value = "";
        }
    };

    return (
        <>
            <Button
                variant="outline"
                disabled={loading}
                onClick={() => inputRef.current?.click()}
                size="sm"
                className="gap-2 cursor-pointer"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t('importExcel')}
            </Button>
            <input
                ref={inputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                disabled={loading}
            />
        </>
    );
}
