"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, TrendingUp } from "lucide-react";

import { KpiRow } from "@/components/cards/kpi-row";
import { RankRows } from "@/components/cards/rank-list";
import { SpendTrend } from "@/components/charts2/spend-trend";
import { AiInsightCard } from "@/components/insights/insight-card";
import { IndiaMap } from "@/components/charts/india-map";
import { MiniLabel, PageFrame } from "@/components/shell/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { InsightsResponse, SummaryResponse } from "@/types";

/**
 * Executive Dashboard — structure taken verbatim from the draft:
 *   page-head → KPI row (6) → chart-row (2fr 1fr 1fr) → bottom-row (1fr 1fr 1.2fr).
 * Nothing is added or moved; only the numbers are real.
 */
export function ExecutiveDashboard() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const setValues = useFilterStore((state) => state.setValues);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);
  const insights = useApi<InsightsResponse>(`/api/insights?${filterQuery}`);

  const kpis = summary.data?.kpis ?? null;
  const states = summary.data?.byState ?? [];
  const mappedStates = states.filter((row) => row.name !== "Pan India" && row.name !== "Not Specified");

  const refresh = () => {
    meta.refetch();
    summary.refetch();
    insights.refetch();
  };

  return (
    <PageFrame
      title="Executive Dashboard"
      subtitle={
        meta.data
          ? `${meta.data.years.length ? meta.data.years.join(" · ") : "No years"} · ${scope || "All states, all sectors"}`
          : "Loading CSR disclosures…"
      }
      meta={meta.data}
      filters={filters}
      onRefresh={refresh}
      isRefreshing={summary.isValidating || insights.isValidating}
      error={summary.error ?? meta.error}
      actions={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={refresh}>
            <RefreshCw width={13} height={13} className={summary.isValidating ? "spin" : undefined} />
            Refresh
          </button>
          <Link href={`/trend-analysis?${filterQuery}`} className="btn btn-gradient btn-sm">
            <TrendingUp width={13} height={13} />
            Analyse trends
          </Link>
        </>
      }
    >
      <MiniLabel>Key performance indicators</MiniLabel>
      <KpiRow kpis={kpis} meta={meta.data} isLoading={summary.isLoading} />

      <MiniLabel>Trend &amp; distribution analysis</MiniLabel>
      <div className="grid chart-row" style={{ marginBottom: 32 }}>
        <div className="card hoverable">
          <div className="card-head">
            <div>
              <h3>CSR Spending Trend</h3>
              <div className="muted">
                {meta.data?.years[0] ?? "—"} – {insights.data?.forecast.nextYear ?? meta.data?.years.slice(-1)[0] ?? "—"}, incl. forecast
              </div>
            </div>
            <span className="card-badge">{kpis?.latestYear ?? "—"}</span>
          </div>
          <div className="chart-wrap h-180">
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : (
              <SpendTrend trend={summary.data?.trend ?? []} forecast={insights.data?.forecast.points} />
            )}
          </div>
        </div>

        <div className="card hoverable">
          <div className="card-head">
            <h3>Top States</h3>
            <Link href={`/state-analysis?${filterQuery}`} className="card-badge">
              View all
            </Link>
          </div>
          {summary.isLoading ? (
            <SkeletonRows />
          ) : (
            <RankRows
              rows={mappedStates}
              limit={5}
              onSelect={(row) => toggleValue("states", row.name)}
              metaMode="projects"
            />
          )}
        </div>

        <div className="card hoverable">
          <div className="card-head">
            <h3>Top Sectors</h3>
            <Link href={`/sector-analysis?${filterQuery}`} className="card-badge">
              View all
            </Link>
          </div>
          {summary.isLoading ? (
            <SkeletonRows />
          ) : (
            <RankRows
              rows={summary.data?.bySector ?? []}
              limit={5}
              valueMode="share"
              metaMode="companies"
              onSelect={(row) => toggleValue("sectors", row.name)}
            />
          )}
        </div>
      </div>

      <MiniLabel>Geographic &amp; company view</MiniLabel>
      <div className="grid bottom-row">
        <div className="card hoverable">
          <div className="card-head">
            <div>
              <h3>State-wise Distribution</h3>
              <div className="muted">Click a state to filter</div>
            </div>
            <span className="card-badge">{kpis?.stateCount ?? 0} states</span>
          </div>
          <div style={{ height: 190 }}>
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : (
              <IndiaMap data={states} selected={filters.states} onSelect={(name) => toggleValue("states", name)} />
            )}
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 12, gap: 8 }}>
            <MiniStat label="Mapped" value={formatCrore(mappedStates.reduce((sum, row) => sum + row.value, 0))} />
            <MiniStat label="Districts" value={formatNumber(kpis?.districtCount ?? 0)} />
            <MiniStat label="Aspirational" value={formatShare(kpis?.aspirationalShare ?? 0)} />
          </div>
        </div>

        <div className="card hoverable">
          <div className="card-head">
            <h3>Top 5 Companies</h3>
            <Link href={`/company-analysis?${filterQuery}`} className="card-badge">
              Compare
            </Link>
          </div>
          {summary.isLoading ? (
            <SkeletonRows />
          ) : (
            <RankRows
              rows={summary.data?.topCompanies ?? []}
              limit={5}
              showAvatar
              metaMode="projects"
              onSelect={(row) => row.id && setValues("companies", [row.id])}
            />
          )}
        </div>

        <AiInsightCard data={insights.data} isLoading={insights.isLoading} filterQuery={filterQuery} />
      </div>
    </PageFrame>
  );
}

function SkeletonRows() {
  return (
    <div className="stack gap-8">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: 40 }} />
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="kpi-label" style={{ marginBottom: 3 }}>
        {label}
      </div>
      <div className="mono truncate1" style={{ fontSize: 13, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}
