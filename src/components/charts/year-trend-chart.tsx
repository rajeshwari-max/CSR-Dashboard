"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_PROPS, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { formatCompact, formatCrore, formatNumber } from "@/lib/format";
import type { TrendPoint } from "@/types";

export function YearTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" {...AXIS_PROPS} />
        <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={(value: number) => formatCompact(value)} />
        <YAxis
          yAxisId="right"
          orientation="right"
          {...AXIS_PROPS}
          tickFormatter={(value: number) => formatCompact(value)}
        />
        <Tooltip
          {...TOOLTIP_STYLES}
          formatter={(value: number, name: string) =>
            name === "Amount spent" ? [formatCrore(value), name] : [formatNumber(value), name]
          }
        />
        <Legend iconType="circle" iconSize={8} />
        <Bar
          yAxisId="left"
          dataKey="spend"
          name="Amount spent"
          fill="hsl(var(--chart-1))"
          radius={[6, 6, 0, 0]}
          maxBarSize={64}
        />
        {/*
          Project *outlay* is intentionally not plotted: for part of FY 2020-21
          the source workbook repeats a company-level outlay on every project
          row, so the aggregate is inflated and not comparable to spend.
        */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="projects"
          name="Projects"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="companies"
          name="Companies reporting"
          stroke="hsl(var(--chart-3))"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
