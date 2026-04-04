"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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

    const handleApply = () => {
        const params = new URLSearchParams(searchParams.toString());
        // Store date strings only (YYYY-MM-DD) — server handles timezone
        params.set("from", from);
        params.set("to", to);
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex items-end gap-3">
            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">من</Label>
                <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-36"
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">إلى</Label>
                <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-36"
                />
            </div>
            <Button size="sm" onClick={handleApply} className="gap-1.5">
                <Search className="w-4 h-4" />
                عرض
            </Button>
        </div>
    );
}
