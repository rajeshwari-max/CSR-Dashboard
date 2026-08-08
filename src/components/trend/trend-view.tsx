"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";

import { ChartTip } from "@/components/charts2/chart-tooltip";
import { SpendTrend } from "@/components/charts2/spend-trend";
import { MiniLabel, PageFrame } from "@/components/shell/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { useApi } from "@/lib/api";
import { formatCompact, formatCrore, formatNumber, formatSignedPercent, truncate } from "@/lib/format";
import type { BreakdownResponse, InsightsResponse, SummaryResponse } from "@/types";

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 10.5 } } as const;
const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

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

  const trend = summary.data?.trend ?? [];
  const years = trend.map((point) => point.year);

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
          label="Latest FY spend"
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
          sub={`Linear fit · R² ${insights.data?.forecast.r2?.toFixed(2) ?? "—"}`}
        />
      </div>

      <MiniLabel>Historical trend</MiniLabel>
      <div className="grid chart-row" style={{ marginBottom: 32 }}>
        <div className="card hoverable">
          <div className="card-head">
            <div>
              <h3>CSR spend by financial year</h3>
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

        <div className="card hoverable">
          <div className="card-head">
            <h3>Growth rate</h3>
          </div>
          <div className="chart-wrap h-260">
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : growth.filter((point) => point.growth !== null).length === 0 ? (
              <div className="empty-state">
                <h4>Needs two years</h4>
                <p>Only one financial year is in view.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growth} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" {...AXIS} />
                  <YAxis {...AXIS} tickFormatter={(value: number) => `${value}%`} />
                  <Tooltip content={<ChartTip money={false} />} />
                  <Bar dataKey="growth" name="YoY growth" radius={[5, 5, 0, 0]} maxBarSize={44}>
                    {growth.map((point) => (
                      <Cell
                        key={point.year}
                        fill={(point.growth ?? 0) >= 0 ? "var(--success)" : "var(--danger)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card hoverable">
          <div className="card-head">
            <h3>Reporting volume</h3>
            <span className="card-badge amber">Coverage</span>
          </div>
          <div className="chart-wrap h-260">
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growth} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" {...AXIS} />
                  <YAxis {...AXIS} tickFormatter={(value: number) => formatCompact(value)} />
                  <Tooltip content={<ChartTip money={false} />} />
                  <Legend iconType="circle" iconSize={7} />
                  <Line dataKey="projects" name="Projects" stroke="var(--blue)" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line dataKey="companies" name="Companies" stroke="var(--purple)" strokeWidth={2} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="unavailable-note mt-8">
            <Info width={10} height={10} style={{ display: "inline", marginRight: 4 }} />
            Coverage changes between years, so totals are not strictly like-for-like.
          </p>
        </div>
      </div>

      <MiniLabel>Growing vs. declining sectors</MiniLabel>
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
              <LineChart data={sectorSeries} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={(value: number) => formatCompact(value)} />
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
              <th style={{ textAlign: "right" }}>Spend</th>
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

      <div className="card unavailable" style={{ marginTop: 16 }}>
        <div className="row gap-8" style={{ alignItems: "flex-start" }}>
          <Info width={15} height={15} style={{ color: "var(--text-soft)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 650, fontSize: 12.5 }}>Monthly / quarterly trend not available</div>
            <p className="unavailable-note" style={{ margin: "4px 0 0" }}>
              CSR disclosures in this dataset are annual totals — there is no date or quarter column to break them
              down. Upload a file containing <code>Start Date</code> or <code>Project Duration</code> and this section
              will add intra-year trends automatically.
            </p>
          </div>
        </div>
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
