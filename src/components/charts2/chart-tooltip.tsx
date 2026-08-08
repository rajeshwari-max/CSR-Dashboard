"use client";

import type { TooltipProps } from "recharts";

import { formatCrore, formatNumber } from "@/lib/format";

/** Tooltip styled with the draft's card tokens rather than Recharts defaults. */
export function ChartTip({ active, payload, label, money = true }: TooltipProps<number, string> & { money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tip-label">{label}</div>
      {payload.map((item) => (
        <div className="tip-row" key={String(item.dataKey)}>
          <span className="tip-dot" style={{ background: item.color }} />
          {item.name}
          <span className="tip-val">
            {money && !/project|compan/i.test(String(item.name))
              ? formatCrore(Number(item.value))
              : formatNumber(Number(item.value))}
          </span>
        </div>
      ))}
    </div>
  );
}
