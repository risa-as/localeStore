"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default function ProfitDatePicker({
    defaultFrom,
    defaultTo,
}: {
    defaultFrom?: string;
    defaultTo?: string;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const today = new Date().toISOString().split("T")[0];
    const [from, setFrom] = useState(defaultFrom || today);
    const [to, setTo] = useState(defaultTo || today);
    const [pending, startTransition] = useTransition();
    const changed = from !== (defaultFrom || today) || to !== (defaultTo || today);
    const valid = !!from && !!to && from <= to;

    const handleApply = () => {
        const params = new URLSearchParams(searchParams.toString());
        // Store date strings only (YYYY-MM-DD) — server handles timezone
        params.set("from", from);
        params.set("to", to);
        if (!valid || pending) return;
        startTransition(() => router.push(`${pathname}?${params.toString()}`));
    };

    return (
        <form aria-label="تحديد فترة الأرباح" className="space-y-2" onSubmit={event => { event.preventDefault(); handleApply(); }}>
        <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
                <Label htmlFor="profit-period-from" className="text-xs text-muted-foreground">من</Label>
                <Input
                    id="profit-period-from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-36"
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="profit-period-to" className="text-xs text-muted-foreground">إلى</Label>
                <Input
                    id="profit-period-to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-36"
                />
            </div>
            <Button type="submit" size="sm" disabled={!valid || pending} className="gap-1.5">
                <Search className="w-4 h-4" />
                {pending ? "جارٍ تحديث التقرير…" : "عرض"}
            </Button>
        </div>
        {!valid ? <p role="status" className="text-xs text-destructive">اختر فترة صحيحة؛ تاريخ النهاية يجب ألا يسبق البداية.</p>
          : changed && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">التواريخ المعدلة لم تُطبّق بعد؛ اضغط «عرض» لتحديث أرقام التقرير.</p>}
        </form>
    );
}
