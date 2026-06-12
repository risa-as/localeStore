"use client";

import { useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface SalesPoint {
  month: string;
  totalSales: number;
}

const Charts = ({
  data: { salesData, dailySalesData },
}: {
  data: {
    salesData: SalesPoint[];
    dailySalesData: SalesPoint[];
  };
}) => {
  const [view, setView] = useState<"monthly" | "daily">("monthly");
  const chartData = view === "monthly" ? salesData : dailySalesData;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        <button
          onClick={() => setView("monthly")}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            view === "monthly"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          شهري
        </button>
        <button
          onClick={() => setView("daily")}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            view === "daily"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          يومي (30 يوم)
        </button>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval={view === "daily" ? 4 : 0}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={90}
            tickFormatter={(v) =>
              v >= 1000
                ? `${(v * 1000 / 1000000).toFixed(0)}M`
                : `${(v * 1000).toLocaleString()}`
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: "12px",
              fontSize: "13px",
            }}
            itemStyle={{ color: "var(--foreground)" }}
            formatter={(value: number | undefined) => [
              `${((value ?? 0) * 1000).toLocaleString("en-US")} د.ع`,
              "المبيعات",
            ]}
          />
          <Area
            type="monotone"
            dataKey="totalSales"
            stroke="#6366f1"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorSales)"
            dot={false}
            activeDot={{ r: 5, fill: "#6366f1" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Charts;
