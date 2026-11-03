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

import { AXIS_PROPS, TOOLTIP_STYLES, xTitle, yTitle } from "@/components/charts/chart-theme";
import { formatCompact, formatCrore, formatNumber } from "@/lib/format";
import type { TrendPoint } from "@/types";

export function YearTrendChart({ data }: { data: TrendPoint[] }) {
  // On a single-company view "companies reporting" is always 1 — not worth a line.
  const showCompanies = data.some((point) => (point.companies ?? 0) > 1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" {...AXIS_PROPS} label={xTitle("Financial year", -14)} />
        <YAxis yAxisId="left" width={64} {...AXIS_PROPS} tickFormatter={(value: number) => formatCompact(value)} label={yTitle("CSR amount spent (₹ crore)")} />
        <YAxis
          yAxisId="right"
          orientation="right"
          width={64}
          {...AXIS_PROPS}
          allowDecimals={false}
          tickFormatter={(value: number) => formatCompact(value)}
          label={yTitle(showCompanies ? "Projects / companies (count)" : "Projects (count)", "right")}
        />
        <Tooltip
          {...TOOLTIP_STYLES}
          formatter={(value: number, name: string) =>
            name.startsWith("Amount spent") ? [formatCrore(value), name] : [formatNumber(value), name]
          }
        />
        <Legend iconType="circle" iconSize={8} verticalAlign="top" height={30} />
        <Bar
          yAxisId="left"
          dataKey="spend"
          name="Amount spent (₹ crore)"
          fill="var(--c1)"
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
          stroke="var(--c2)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3 }}
        />
        {showCompanies ? (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="companies"
            name="Companies reporting"
            stroke="var(--c3)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
