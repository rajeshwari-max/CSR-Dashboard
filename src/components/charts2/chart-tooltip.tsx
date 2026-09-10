"use client";

import type { TooltipProps } from "recharts";

import { formatCrore, formatNumber } from "@/lib/format";

/**
 * Tooltip styled with the draft's card tokens rather than the Recharts default.
 *
 * The default prints every series name in that series' own colour, which is
 * unreadable for the lighter hues in the palette against a light card. This one
 * carries the colour in a dot and prints the text in the body colour.
 *
 * `money`:
 *   "auto"  — currency unless the series name mentions projects or companies
 *             (the counting series in the trend view). Default.
 *   true    — always currency. Use where every series is a spend figure and a
 *             legitimate name could contain "compan" (e.g. a BRSR sector).
 *   false   — always a plain count.
 */
export function ChartTip({
  active,
  payload,
  label,
  money = "auto",
}: TooltipProps<number, string> & { money?: boolean | "auto" }) {
  if (!active || !payload?.length) return null;

  const asMoney = (name: string) =>
    money === "auto" ? !/project|compan/i.test(name) : money;

  return (
    <div className="chart-tip">
      <div className="tip-label">{label}</div>
      {payload.map((item) => (
        <div className="tip-row" key={String(item.dataKey)}>
          <span className="tip-dot" style={{ background: item.color }} />
          {item.name}
          <span className="tip-val">
            {asMoney(String(item.name))
              ? formatCrore(Number(item.value))
              : formatNumber(Number(item.value))}
          </span>
        </div>
      ))}
    </div>
  );
}
