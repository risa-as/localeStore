"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatePickerWithRange } from "@/components/shared/date-range-picker";
import { DateRange } from "react-day-picker";
import { useEffect, useState } from "react";
import { addDays } from "date-fns";

export default function ProfitDatePicker({
    defaultFrom,
    defaultTo,
}: {
    defaultFrom?: Date;
    defaultTo?: Date;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [date, setDate] = useState<DateRange | undefined>({
        from: defaultFrom || new Date(),
        to: defaultTo || new Date(),
    });

    useEffect(() => {
        if (date?.from) {
            const params = new URLSearchParams(searchParams.toString());
            const fromSort = date.from.toISOString();
            const toSort = date.to ? date.to.toISOString() : "";

            const currentFrom = params.get("from");
            const currentTo = params.get("to") || "";

            if (fromSort !== currentFrom || toSort !== currentTo) {
                if (date.from) {
                    params.set("from", date.from.toISOString());
                } else {
                    params.delete("from");
                }
                if (date.to) {
                    params.set("to", date.to.toISOString());
                } else {
                    params.delete("to");
                }
                router.push(`${pathname}?${params.toString()}`);
            }
        }
    }, [date, router, pathname, searchParams]);

    return <DatePickerWithRange date={date} setDate={setDate} />;
}
