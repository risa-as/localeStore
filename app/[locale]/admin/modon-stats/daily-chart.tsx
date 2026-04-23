"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function DailyChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          formatter={(v) => [`${v} طلب`, "المرسل"]}
          labelFormatter={(l) => `تاريخ: ${l}`}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#colorCount)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
