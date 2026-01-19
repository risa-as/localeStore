"use client";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const Charts = ({
  data: { salesData },
}: {
  data: { salesData: { month: string; totalSales: number }[] };
}) => {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={salesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickMargin={40}
          width={80}
          tickFormatter={(value) => `${(value * 1000).toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
          itemStyle={{ color: 'var(--foreground)' }}
          formatter={(value: any) => [`${(value * 1000).toLocaleString()} IQD`, "Sales"]}
        />
        <Area
          type="monotone"
          dataKey="totalSales"
          stroke="#8884d8"
          fillOpacity={1}
          fill="url(#colorSales)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default Charts;
