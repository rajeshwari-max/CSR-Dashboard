"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTip } from "@/components/charts2/chart-tooltip";
import { formatCompact } from "@/lib/format";
import type { ForecastPoint, TrendPoint } from "@/types";

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 10.5 } } as const;

/**
 * "CSR Spending Trend" from the draft — actuals plus the projection, which is
 * what the drafted caption ("incl. forecast") promises.
 */
export function SpendTrend({
  trend,
  forecast,
  height,
}: {
  trend: TrendPoint[];
  forecast?: ForecastPoint[];
  height?: number;
}) {
  const data =
    forecast && forecast.length
      ? forecast.map((point) => ({
          year: point.year,
          spend: point.spend,
          projected: point.projected,
          band: point.upper !== null && point.lower !== null ? point.upper - point.lower : null,
          lower: point.lower,
        }))
      : trend.map((point) => ({ year: point.year, spend: point.spend, projected: null, band: null, lower: null }));

  return (
    <ResponsiveContainer width="100%" height={height ?? "100%"}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--c1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(value: number) => formatCompact(value)} />
        <Tooltip content={<ChartTip />} />
        <Legend iconType="circle" iconSize={7} />
        <Area
          dataKey="lower"
          name=" "
          stackId="band"
          stroke="none"
          fill="transparent"
          legendType="none"
          isAnimationActive={false}
        />
        <Area
          dataKey="band"
          name="Forecast range"
          stackId="band"
          stroke="none"
          fill="var(--c6)"
          fillOpacity={0.14}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="spend"
          name="Amount spent"
          stroke="var(--c1)"
          strokeWidth={2.2}
          fill="url(#spendFill)"
          dot={{ r: 2.5 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="projected"
          name="Projected"
          stroke="var(--c6)"
          strokeWidth={2.2}
          strokeDasharray="5 4"
          dot={{ r: 2.5 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
