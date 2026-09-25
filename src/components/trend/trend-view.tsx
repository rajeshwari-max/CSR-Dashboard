"use client";

import * as React from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { ChartTip } from "@/components/charts2/chart-tooltip";
import { SpendTrend } from "@/components/charts2/spend-trend";
import { MiniLabel, PageFrame } from "@/components/shell/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { useApi } from "@/lib/api";
import { formatCompact, formatCrore, formatNumber, formatSignedPercent, truncate } from "@/lib/format";
import type { BreakdownResponse, InsightsResponse, SummaryResponse } from "@/types";

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 10.5 } } as const;
const PALETTE = ["#7e3fa1", "#00a88f", "#e07a24", "#2468b4", "#d64562", "#6f7d2c"];

/**
 * Trend Analysis — deliberately separate from AI Insights. This page is about
 * movement over time (growth rates, risers, fallers, historical comparison);
 * AI Insights is about interpretation. They never share a component.
 */
export function TrendView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=10`);
  const insights = useApi<InsightsResponse>(`/api/insights?${filterQuery}`);
  const sectors = useApi<BreakdownResponse>(`/api/breakdown?dimension=sector&${filterQuery}&limit=80`);
  const states = useApi<BreakdownResponse>(`/api/breakdown?dimension=state&${filterQuery}&limit=60`);

  const trend = React.useMemo(() => summary.data?.trend ?? [], [summary.data]);
  const years = React.useMemo(() => trend.map((point) => point.year), [trend]);

  const growth = React.useMemo(
    () =>
      trend.map((point, index) => {
        const previous = index > 0 ? trend[index - 1].spend : null;
        return {
          year: point.year,
          spend: point.spend,
          growth: previous && previous > 0 ? Math.round(((point.spend - previous) / previous) * 1000) / 10 : null,
          projects: point.projects,
          companies: point.companies,
        };
      }),
    [trend],
  );

  const movers = React.useMemo(() => {
    const rows = (sectors.data?.rows ?? []).filter(
      (row) => (row.previous ?? 0) >= 5 && row.yoyGrowthPct !== null,
    );
    const sorted = [...rows].sort((a, b) => (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0));
    return { growing: sorted.slice(0, 8), declining: sorted.slice(-8).reverse() };
  }, [sectors.data]);

  const sectorSeries = React.useMemo(() => {
    const top = (sectors.data?.rows ?? []).slice(0, 6).map((row) => row.name);
    const byName = new Map((sectors.data?.series ?? []).map((item) => [item.name, item.values]));
    return years.map((year) => {
      const entry: Record<string, string | number> = { year };
      for (const name of top) entry[name] = byName.get(name)?.[year] ?? 0;
      return entry;
    });
  }, [sectors.data, years]);

  const topSectors = (sectors.data?.rows ?? []).slice(0, 6);
  const cagr = React.useMemo(() => {
    if (trend.length < 2) return null;
    const first = trend[0].spend;
    const last = trend[trend.length - 1].spend;
    if (first <= 0) return null;
    return Math.round(((last / first) ** (1 / (trend.length - 1)) - 1) * 1000) / 10;
  }, [trend]);

  return (
    <PageFrame
      title="Trend Analysis"
      subtitle={`Year-over-year movement · ${scope || "all companies, all states"}`}
      meta={meta.data}
      filters={filters}
      onRefresh={() => {
        summary.refetch();
        sectors.refetch();
        states.refetch();
        insights.refetch();
      }}
      isRefreshing={summary.isValidating}
      error={summary.error ?? meta.error}
    >
      <MiniLabel>Growth summary</MiniLabel>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Metric
          label="Latest FY amount spent"
          value={formatCrore(summary.data?.kpis.latestYearSpend ?? 0)}
          sub={summary.data?.kpis.latestYear ?? "—"}
          delta={summary.data?.kpis.yoyGrowthPct ?? null}
        />
        <Metric
          label="Year-on-year growth"
          value={formatSignedPercent(summary.data?.kpis.yoyGrowthPct ?? null)}
          sub={`${summary.data?.kpis.previousYear ?? "—"} → ${summary.data?.kpis.latestYear ?? "—"}`}
        />
        <Metric
          label="Compound growth (CAGR)"
          value={cagr === null ? "—" : formatSignedPercent(cagr)}
          sub={years.length ? `${years[0]} → ${years[years.length - 1]}` : "Needs 2+ years"}
        />
        <Metric
          label={`Projected ${insights.data?.forecast.nextYear ?? "next FY"}`}
          value={
            insights.data?.forecast.nextYearSpend !== null && insights.data?.forecast.nextYearSpend !== undefined
              ? formatCrore(insights.data.forecast.nextYearSpend)
              : "—"
          }
          sub="Estimated from the historical trend"
        />
      </div>

      <MiniLabel>Historical trend</MiniLabel>
      <div className="grid" style={{ marginBottom: 32, gridTemplateColumns: "1fr" }}>
        <div className="card hoverable">
          <div className="card-head">
            <div>
            <h3>CSR amount spent by financial year</h3>
              <div className="muted">Actuals with projection band</div>
            </div>
          </div>
          <div className="chart-wrap h-260">
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : (
              <SpendTrend trend={trend} forecast={insights.data?.forecast.points} />
            )}
          </div>
        </div>

      </div>

      <MiniLabel>Growing vs. declining sectors · {years.at(-2) ?? "prior FY"} to {years.at(-1) ?? "latest FY"}</MiniLabel>
      <div className="grid cols-2" style={{ marginBottom: 32 }}>
        <MoverCard title="Growing sectors" rows={movers.growing} direction="up" loading={sectors.isLoading} />
        <MoverCard title="Declining sectors" rows={movers.declining} direction="down" loading={sectors.isLoading} />
      </div>

      <MiniLabel>Sector trajectories</MiniLabel>
      <div className="card hoverable" style={{ marginBottom: 32 }}>
        <div className="card-head">
          <div>
            <h3>Top sectors over time</h3>
            <div className="muted">Six largest sectors in the current selection</div>
          </div>
        </div>
        <div className="chart-wrap h-300">
          {sectors.isLoading ? (
            <div className="skeleton" style={{ height: "100%" }} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sectorSeries} margin={{ top: 6, right: 18, bottom: 24, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" {...AXIS} label={{ value: "Financial year", position: "insideBottom", offset: -14 }} />
                <YAxis {...AXIS} tickFormatter={(value: number) => formatCompact(value)} label={{ value: "Amount spent (₹ Cr)", angle: -90, position: "insideLeft", offset: -4 }} />
                <Tooltip content={<ChartTip />} />
                <Legend iconType="circle" iconSize={7} />
                {topSectors.map((sector, index) => (
                  <Line
                    key={sector.name}
                    type="monotone"
                    dataKey={sector.name}
                    stroke={PALETTE[index % PALETTE.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <MiniLabel>Historical comparison</MiniLabel>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Financial year</th>
              <th style={{ textAlign: "right" }}>Amount spent (₹ Cr)</th>
              <th style={{ textAlign: "right" }}>YoY</th>
              <th style={{ textAlign: "right" }}>Projects</th>
              <th style={{ textAlign: "right" }}>Companies</th>
              <th style={{ textAlign: "right" }}>Avg / company</th>
            </tr>
          </thead>
          <tbody>
            {growth.map((point) => (
              <tr key={point.year}>
                <td className="cell-strong mono">{point.year}</td>
                <td className="mono" style={{ textAlign: "right" }}>{formatCrore(point.spend)}</td>
                <td style={{ textAlign: "right" }}>
                  {point.growth === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className={`kpi-delta ${point.growth >= 0 ? "up" : "down"}`}>
                      {formatSignedPercent(point.growth)}
                    </span>
                  )}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>{formatNumber(point.projects)}</td>
                <td className="mono" style={{ textAlign: "right" }}>{formatNumber(point.companies)}</td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {formatCrore(point.companies ? point.spend / point.companies : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </PageFrame>
  );
}

function Metric({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
}) {
  return (
    <div className="kpi-card" style={{ cursor: "default" }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">
        {delta !== undefined && delta !== null ? (
          <span className={`kpi-delta ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? <ArrowUpRight width={11} height={11} /> : <ArrowDownRight width={11} height={11} />}
            {formatSignedPercent(delta)}
          </span>
        ) : null}
        <span className="truncate1">{sub}</span>
      </div>
    </div>
  );
}

function MoverCard({
  title,
  rows,
  direction,
  loading,
}: {
  title: string;
  rows: { name: string; value: number; yoyGrowthPct?: number | null; previous?: number; latest?: number }[];
  direction: "up" | "down";
  loading: boolean;
}) {
  return (
    <div className="card hoverable">
      <div className="card-head">
        <h3>{title}</h3>
        <span className={`card-badge ${direction === "up" ? "" : "rose"}`}>
          {direction === "up" ? "Risers" : "Fallers"}
        </span>
      </div>
      {loading ? (
        <div className="stack gap-8">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton" style={{ height: 34 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <h4>Not enough history</h4>
          <p>Needs two financial years with at least ₹5 Cr in the prior year.</p>
        </div>
      ) : (
        rows.map((row) => (
          <div className="rank-row" key={row.name} style={{ cursor: "default" }}>
            <div className="rank-main">
              <div className="rank-name truncate1">{truncate(row.name, 30)}</div>
              <div className="rank-meta mono">
                {formatCrore(row.previous ?? 0)} → {formatCrore(row.latest ?? 0)}
              </div>
            </div>
            <div className={`kpi-delta ${(row.yoyGrowthPct ?? 0) >= 0 ? "up" : "down"}`}>
              {formatSignedPercent(row.yoyGrowthPct ?? null)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
