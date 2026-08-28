"use client";

import * as React from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { IndiaMap } from "@/components/charts/india-map";
import { ProjectRegisterSection } from "@/components/dashboard/project-register-section";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare, formatSignedPercent } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { BreakdownResponse, SummaryResponse } from "@/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";

const NON_GEOGRAPHIC = new Set(["Pan India", "Not Specified"]);

export function StateAnalysisView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);
  const districts = useApi<BreakdownResponse>(`/api/breakdown?dimension=district&${filterQuery}&limit=400`);
  const stateSeries = useApi<BreakdownResponse>(`/api/breakdown?dimension=state&${filterQuery}&limit=60`);

  const states = React.useMemo(() => summary.data?.byState ?? [], [summary.data]);
  const mapped = React.useMemo(
    () => states.filter((row) => !NON_GEOGRAPHIC.has(row.name)),
    [states],
  );
  const years = React.useMemo(
    () => summary.data?.trend.map((point) => point.year) ?? [],
    [summary.data],
  );

  // Grouped bars: top 8 mapped states × every financial year in view.
  const comparison = React.useMemo(() => {
    const byName = new Map((stateSeries.data?.series ?? []).map((item) => [item.name, item.values]));
    return mapped.slice(0, 8).map((row) => {
      const values = byName.get(row.name) ?? {};
      const entry: Record<string, string | number> = { name: row.name };
      for (const year of years) entry[year] = values[year] ?? 0;
      return entry;
    });
  }, [mapped, stateSeries.data, years]);

  const totalMapped = mapped.reduce((sum, row) => sum + row.value, 0);
  const unmapped = states.filter((row) => NON_GEOGRAPHIC.has(row.name));

  return (
    <PageFrame
      title="State Analysis"
      subtitle={`Geographic distribution of CSR spend · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        districts.refetch();
        stateSeries.refetch();
      }}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>India map &amp; heatmap</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="State-wise CSR Spend"
          description="Click a state to filter · sqrt colour scale"
          className="xl:col-span-2"
          height={520}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!states.length}
        >
          <IndiaMap data={states} selected={filters.states} onSelect={(name) => toggleValue("states", name)} />
        </ChartCard>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Coverage</CardTitle>
                <CardDescription>How much spend can be placed geographically</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="States with spend" value={String(mapped.length)} />
              <Row label="Districts with spend" value={formatNumber(summary.data?.kpis.districtCount ?? 0)} />
              <Row label="State-attributed spend" value={formatCrore(totalMapped)} />
              {unmapped.map((row) => (
                <Row
                  key={row.name}
                  label={row.name}
                  value={`${formatCrore(row.value)} · ${formatShare(row.share)}`}
                  muted
                />
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Rows filed as &ldquo;Pan India&rdquo; or with no state cannot be mapped, so the choropleth covers{" "}
                {formatShare(totalMapped / Math.max(1, summary.data?.kpis.totalSpend ?? 1))} of spend in this view.
              </p>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <div>
                <CardTitle>Fastest growing states</CardTitle>
                <CardDescription>Latest FY vs. previous, minimum ₹10 Cr base</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {mapped
                .filter((row) => (row.previous ?? 0) >= 10 && row.yoyGrowthPct !== null)
                .sort((a, b) => (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0))
                .slice(0, 6)
                .map((row) => (
                  <div key={row.name} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate">{row.name}</span>
                    <span className="numeric shrink-0 font-semibold text-success">
                      {formatSignedPercent(row.yoyGrowthPct)}
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <SectionLabel>State comparison</SectionLabel>
      <ChartCard
        title="Annual CSR spend across leading states"
        description="Top 8 mapped states; values are project spend in INR crore"
        height={340}
        isLoading={summary.isLoading}
        error={summary.error}
        isEmpty={comparison.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparison} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...AXIS_PROPS} interval={0} angle={-18} textAnchor="end" height={60} />
            <YAxis {...AXIS_PROPS} tickFormatter={(value: number) => formatCrore(value, false)} width={72} />
            <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => formatCrore(value)} />
            <Legend iconType="circle" iconSize={8} />
            {years.map((year, index) => (
              <Bar key={year} dataKey={year} name={year} fill={colorAt(index)} radius={[5, 5, 0, 0]} maxBarSize={26} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionLabel>Top states</SectionLabel>
      <Card>
        <CardContent className="px-0 pt-4">
          <BreakdownTable
            rows={states}
            label="State"
            limit={40}
            selected={filters.states}
            onSelect={(name) => toggleValue("states", name)}
            latestLabel={years[years.length - 1]}
            columns={["value", "share", "count", "companies", "latest", "yoy"]}
          />
        </CardContent>
      </Card>

      <SectionLabel>District analysis</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Districts by CSR spend</CardTitle>
            <CardDescription>
              {formatNumber(districts.data?.rows.length ?? 0)} districts recorded · click to filter
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <BreakdownTable
            rows={districts.data?.rows ?? []}
            label="District"
            limit={40}
            selected={filters.districts}
            onSelect={(name) => toggleValue("districts", name)}
            columns={["value", "share", "count", "companies", "yoy"]}
          />
        </CardContent>
      </Card>

      <ProjectRegisterSection filterQuery={filterQuery} />
    </PageFrame>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? "text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>{label}</span>
      <span className="numeric text-[13px] font-semibold">{value}</span>
    </div>
  );
}
