"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CircleHelp, RefreshCw, TrendingUp, Wallet } from "lucide-react";

import { KpiRow } from "@/components/cards/kpi-row";
import { RankRows } from "@/components/cards/rank-list";
import { SpendTrend } from "@/components/charts2/spend-trend";
import { AiInsightCard } from "@/components/insights/insight-card";
import { IndiaMap } from "@/components/charts/india-map";
import { MiniLabel, PageFrame } from "@/components/shell/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { ExportMenu } from "@/components/shared/export-menu";
import { useTour } from "@/components/tour/guided-tour";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { InsightsResponse, SummaryResponse } from "@/types";
import { ExplainedTitle } from "@/components/shared/metric-info";
import type { PolicyInsights } from "@/lib/policy";
import { canScopeAnnexureFinancials } from "@/lib/annexure-scope";

/**
 * Overview (formerly Executive Dashboard) — structure taken verbatim from the draft:
 *   page-head → KPI row (6) → chart-row (2fr 1fr 1fr) → bottom-row (1fr 1fr 1.2fr).
 * Nothing is added or moved; only the numbers are real.
 */
export function ExecutiveDashboard() {
  const { openTour } = useTour();
  const { filters, filterQuery } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const setValues = useFilterStore((state) => state.setValues);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);
  const insights = useApi<InsightsResponse>(`/api/insights?${filterQuery}`);
  const policy = useApi<PolicyInsights>(`/api/policy?${filterQuery}`);

  const kpis = summary.data?.kpis ?? null;
  const annexureScopeSupported = canScopeAnnexureFinancials(filters);
  // Full period covered by the data, regardless of the Year filter (e.g. "FY 2020-21 to FY 2024-25").
  const allYears = meta.data?.years ?? [];
  const dataPeriod = allYears.length ? `${allYears[0]} to ${allYears[allYears.length - 1]}` : null;
  const states = summary.data?.byState ?? [];
  const mappedStates = states.filter(
    (row) => !["Pan India", "Not Specified", "District Not Classified Elsewhere"].includes(row.name),
  );

  const refresh = () => {
    meta.refetch();
    summary.refetch();
    insights.refetch();
  };

  return (
    <PageFrame
      title="Overview"
      subtitle="Explore India's corporate CSR landscape through company-wise spending, projects, sectors, geographical coverage and implementation trends."
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
          <ExportMenu filterQuery={filterQuery} label="Download Data / Export Report" />
          <Link href={`/trend-analysis?${filterQuery}`} className="btn btn-gradient btn-sm">
            <TrendingUp width={13} height={13} />
            Explore CSR Trends
          </Link>
        </>
      }
    >
      <div className="card" style={{ padding: "18px 22px", marginBottom: 26 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 650 }}>CSR Intelligence Dashboard</div>
          <button
            type="button"
            onClick={openTour}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--c1)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            <CircleHelp width={14} height={14} /> How to use this dashboard · Take a tour
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 6px" }}>
          Explore India&apos;s CSR landscape through company contributions, CSR expenditure, sectoral priorities, geographical distribution and project implementation.
          {dataPeriod ? (
            <>
              {" "}The data covers <strong style={{ color: "var(--text)" }}>{allYears.length} financial years, from {dataPeriod}</strong>.
            </>
          ) : null}
        </p>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Use the filters to identify companies, understand funding patterns, explore districts and sectors, and discover emerging CSR trends.
        </p>
      </div>

      <MiniLabel>India&apos;s CSR at a Glance</MiniLabel>
      <KpiRow
        kpis={kpis}
        meta={meta.data}
        isLoading={summary.isLoading}
        extra={{
          label: "Reported Unspent CSR Amount",
          value: !annexureScopeSupported ? "—" : policy.isLoading ? "…" : policy.data?.financials ? formatCrore(policy.data.financials.unspent) : "—",
          sub: !annexureScopeSupported
            ? "Not available for location filters"
            : policy.data?.financials
              ? `Left unspent by ${formatNumber(policy.data.financials.unspentCompanies)} companies`
              : "No CSR report data",
          icon: Wallet,
          href: "/company-analysis#unspent-csr",
          tip: "CSR amount companies reported as unspent in their annual CSR reports. Click for the yearly breakdown and full company list.",
        }}
      />
      <p className="muted" style={{ fontSize: 12.5, margin: "-6px 0 26px", lineHeight: 1.5 }}>
        <strong style={{ color: "var(--text)" }}>About the Data: Data Sources:</strong> CSR expenditure, project details and geographical
        coverage are sourced from project-wise filings on the{" "}
        <a href="https://www.csr.gov.in" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>MCA National CSR Portal</a>.
        Information on CSR obligations, unspent amounts, impact assessments and implementing agencies is compiled from
        companies&apos; annual CSR reports filed with the NSE.
      </p>

      <MiniLabel>CSR Trends and Distribution</MiniLabel>
      <div className="grid chart-row" style={{ marginBottom: 32 }}>
        <div className="card hoverable" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <div>
              <ExplainedTitle title="CSR Expenditure and Project Trends" />
              <div className="muted">
                Understand how corporate CSR expenditure and the number of reported projects have changed over the last five financial years. Select a year in the Financial Year filter to view detailed information.
              </div>
            </div>
            <span className="card-badge">{kpis?.latestYear ?? "—"}</span>
          </div>
          <div className="chart-wrap" style={{ flex: 1, minHeight: 300, marginTop: 8 }}>
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : (
              <SpendTrend trend={summary.data?.trend ?? []} />
            )}
          </div>
        </div>

        <div className="card hoverable">
          <div className="card-head">
            <ExplainedTitle title="Which States Receive the Highest CSR Investment?" />
            <Link href={`/state-analysis?${filterQuery}`} className="card-badge">
              View All Results
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
            <ExplainedTitle title="Top Sectors by Share of CSR Expenditure" />
            <Link href={`/sector-analysis?${filterQuery}`} className="card-badge">
              View All Results
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

      <MiniLabel>CSR Investment Landscape: Geography, Companies &amp; Insights</MiniLabel>
      <p className="muted" style={{ fontSize: 13, margin: "-8px 0 16px", lineHeight: 1.5 }}>
        Explore the geographical distribution of CSR expenditure across India, identify leading corporate contributors and discover key trends, patterns and data insights.
      </p>
      <div className="grid bottom-row">
        <div className="card hoverable">
          <div className="card-head">
            <div>
              <ExplainedTitle title="Geographic Distribution of Total CSR Spent by State" />
              <div className="muted">Click a state to filter</div>
            </div>
            <span className="card-badge">Across India</span>
          </div>
          <div style={{ height: 260 }}>
            {summary.isLoading ? (
              <div className="skeleton" style={{ height: "100%" }} />
            ) : (
              <IndiaMap data={states} selected={filters.states} onSelect={(name) => toggleValue("states", name)} showUnmapped={false} />
            )}
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 12, gap: 8 }}>
            <MiniStat label="Mapped" value={formatCrore(mappedStates.reduce((sum, row) => sum + row.value, 0))} />
            <MiniStat label="Districts" value={formatNumber(kpis?.districtCount ?? 0)} />
            <MiniStat label="Share of total CSR spent in aspirational districts" value={formatShare(kpis?.aspirationalShare ?? 0)} />
          </div>
        </div>

        <div className="card hoverable">
          <div className="card-head">
            <ExplainedTitle title="Companies Ranked by Total CSR Spent" />
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
