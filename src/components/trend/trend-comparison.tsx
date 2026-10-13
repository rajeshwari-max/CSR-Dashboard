"use client";

import * as React from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTip } from "@/components/charts2/chart-tooltip";
import { ExplainedTitle } from "@/components/shared/metric-info";
import { useApi } from "@/lib/api";
import { formatCompact, formatCrore, formatSignedPercent, truncate } from "@/lib/format";
import type { BreakdownResponse, Dimension } from "@/types";

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const;
const PALETTE = ["#7e3fa1", "#00a88f", "#e07a24", "#2468b4", "#d64562", "#6f7d2c"];
const MAX_LINES = 6;

const OPTIONS: { key: Dimension; label: string; noun: string }[] = [
  { key: "state", label: "States", noun: "state" },
  { key: "theme", label: "Schedule VII categories", noun: "category" },
  { key: "sector", label: "Sectors", noun: "sector" },
  { key: "company", label: "Companies", noun: "company" },
  { key: "district", label: "Districts", noun: "district" },
];

/** Filing conventions rather than places or programmes; they would crowd the comparison. */
const NOT_COMPARABLE = new Set(["Pan India", "Not Specified", "District Not Classified Elsewhere", "Unclassified", "Nec/ Not Mentioned"]);

function change(from: number | undefined, to: number | undefined): number | null {
  if (!from || from <= 0 || to === undefined) return null;
  return ((to - from) / from) * 100;
}

/**
 * Year-by-year comparison across states, Schedule VII categories (programmes),
 * sectors, companies or districts: a line per item plus a table with every
 * year, the latest year-on-year change and the change across the period.
 */
export function TrendComparison({ filterQuery }: { filterQuery: string }) {
  const [dimension, setDimension] = React.useState<Dimension>("state");
  const [picked, setPicked] = React.useState<string[] | null>(null);
  const breakdown = useApi<BreakdownResponse>(`/api/breakdown?dimension=${dimension}&${filterQuery}&limit=30`);

  const years = React.useMemo(() => breakdown.data?.years ?? [], [breakdown.data]);
  const items = React.useMemo(() => {
    const series = new Map((breakdown.data?.series ?? []).map((item) => [item.name, item.values]));
    return (breakdown.data?.rows ?? [])
      .filter((row) => !NOT_COMPARABLE.has(row.name) && series.has(row.name))
      .slice(0, 15)
      .map((row) => {
        const values = series.get(row.name) ?? {};
        const first = years.find((year) => (values[year] ?? 0) > 0);
        const last = years.at(-1);
        const previous = years.at(-2);
        return {
          name: row.name,
          total: row.value,
          values,
          yoy: last && previous ? change(values[previous], values[last] ?? 0) : null,
          overall: first && last && first !== last ? change(values[first], values[last] ?? 0) : null,
          since: first,
        };
      });
  }, [breakdown.data, years]);

  const shown = React.useMemo(
    () => (picked ?? items.slice(0, 5).map((item) => item.name)).filter((name) => items.some((item) => item.name === name)),
    [picked, items],
  );

  const chartData = React.useMemo(
    () =>
      years.map((year) => {
        const entry: Record<string, string | number> = { year };
        for (const item of items) if (shown.includes(item.name)) entry[item.name] = item.values[year] ?? 0;
        return entry;
      }),
    [years, items, shown],
  );

  const toggle = (name: string) => {
    const current = shown;
    if (current.includes(name)) setPicked(current.filter((value) => value !== name));
    else if (current.length < MAX_LINES) setPicked([...current, name]);
  };

  const option = OPTIONS.find((item) => item.key === dimension) ?? OPTIONS[0];

  return (
    <div className="card hoverable" style={{ marginBottom: 32 }}>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <ExplainedTitle title="Compare CSR Spent Over Time" />
          <div className="muted">
            Pick what to compare, then tick up to {MAX_LINES} rows to plot them. Pan India and unspecified filings are left out.
          </div>
        </div>
        <div className="row gap-8" style={{ flexWrap: "wrap" }} role="tablist" aria-label="Compare by">
          {OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={dimension === item.key}
              className={`btn btn-sm ${dimension === item.key ? "btn-primary" : "btn-outline"}`}
              onClick={() => {
                setDimension(item.key);
                setPicked(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-wrap h-300">
        {breakdown.isLoading ? (
          <div className="skeleton" style={{ height: "100%" }} />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h4>Nothing to compare</h4>
            <p>No {option.label.toLowerCase()} match the current filters.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 28, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" {...AXIS} label={{ value: "Financial year", position: "insideBottom", offset: -14 }} />
              <YAxis
                {...AXIS}
                tickFormatter={(value: number) => formatCompact(value)}
                label={{ value: "Amount spent (₹ Cr)", angle: -90, position: "insideLeft", offset: -4 }}
              />
              <Tooltip content={<ChartTip money />} />
              <Legend iconType="circle" iconSize={8} verticalAlign="top" height={34} wrapperStyle={{ fontSize: 12 }} />
              {shown.map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={truncate(name, 34)}
                  stroke={PALETTE[items.findIndex((item) => item.name === name) % PALETTE.length]}
                  strokeWidth={2.25}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {items.length ? (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }} aria-label="Plot" />
                <th>{option.label.replace(/s$/, "").replace(/ie$/, "y")}</th>
                {years.map((year) => (
                  <th key={year} style={{ textAlign: "right" }}>{year.replace(/^FY\s*/, "FY")}</th>
                ))}
                <th style={{ textAlign: "right" }}>Latest YoY</th>
                <th style={{ textAlign: "right" }}>Change over period</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const on = shown.includes(item.name);
                const color = PALETTE[items.indexOf(item) % PALETTE.length];
                return (
                  <tr key={item.name} onClick={() => toggle(item.name)} style={{ cursor: "pointer" }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(item.name)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={!on && shown.length >= MAX_LINES}
                        aria-label={`Plot ${item.name}`}
                        style={{ accentColor: color }}
                      />
                    </td>
                    <td className="cell-strong">{truncate(item.name, 42)}</td>
                    {years.map((year) => (
                      <td key={year} className="mono" style={{ textAlign: "right" }}>
                        {item.values[year] ? formatCrore(item.values[year]) : <span className="muted">—</span>}
                      </td>
                    ))}
                    <td style={{ textAlign: "right" }}>
                      {item.yoy === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className={`kpi-delta ${item.yoy >= 0 ? "up" : "down"}`}>{formatSignedPercent(item.yoy)}</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }} title={item.since ? `From ${item.since}` : undefined}>
                      {item.overall === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className={`kpi-delta ${item.overall >= 0 ? "up" : "down"}`}>{formatSignedPercent(item.overall)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Top 15 by total amount spent in the current selection. “Change over period” runs from the first year with spending
            to the latest year. The number of companies filing changes from year to year, so read changes alongside the
            company counts in the table below.
          </p>
        </div>
      ) : null}
    </div>
  );
}
