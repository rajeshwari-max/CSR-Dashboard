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
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { ChartTip } from "@/components/charts2/chart-tooltip";

const NON_GEOGRAPHIC = new Set(["Pan India", "Not Specified", "District Not Classified Elsewhere"]);

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

  // Previous vs latest financial year for the top eight mapped states.
  const comparison = React.useMemo(() => {
    const byName = new Map((stateSeries.data?.series ?? []).map((item) => [item.name, item.values]));
    return mapped.slice(0, 8).map((row) => {
      const values = byName.get(row.name) ?? {};
      return {
        name: row.name,
        previous: values[years.at(-2) ?? ""] ?? 0,
        latest: values[years.at(-1) ?? ""] ?? 0,
      };
    });
  }, [mapped, stateSeries.data, years]);

  const totalMapped = mapped.reduce((sum, row) => sum + row.value, 0);
  const unmapped = states.filter((row) => NON_GEOGRAPHIC.has(row.name));

  return (
    <PageFrame
      title="State Analysis"
      subtitle={`Geographic distribution of CSR spent · ${scope}`}
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
          title="State-wise Total CSR Spent"
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
                <CardTitle>Geographic Coverage Summary</CardTitle>
                <CardDescription>How much of the amount spent can be placed geographically</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Geographic coverage" value="Across India" />
              <Row label="Districts receiving funds" value={formatNumber(summary.data?.kpis.districtCount ?? 0)} />
              <Row label="State-attributed amount spent" value={formatCrore(totalMapped)} />
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
                {formatShare(totalMapped / Math.max(1, summary.data?.kpis.totalSpend ?? 1))} of amount spent in this view.
              </p>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <div>
                <CardTitle>Fastest-Growing States by CSR Spent</CardTitle>
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
        title="Leading States: CSR Spent, Previous vs Latest Year"
        description={`Top 8 states · ${years.at(-2) ?? "Previous FY"} vs ${years.at(-1) ?? "Latest FY"} · ₹ crore, change shown at the end of each pair`}
        height={460}
        isLoading={summary.isLoading}
        error={summary.error}
        isEmpty={comparison.length === 0}
      >
        {/* A radar made eight states hard to compare; paired horizontal bars
            put every value on one shared scale with the state name beside it. */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={comparison}
            layout="vertical"
            margin={{ top: 4, right: 96, bottom: 4, left: 8 }}
            barCategoryGap="22%"
            barGap={3}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={(value: number) => formatCrore(value, false)} />
            <YAxis
              type="category"
              dataKey="name"
              {...AXIS_PROPS}
              width={128}
              tick={{ fontSize: 12.5, fill: "var(--text)" }}
            />
            <Tooltip content={<ChartTip money />} cursor={TOOLTIP_STYLES.cursor} />
            <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12.5 }} />
            <Bar
              dataKey="previous"
              name={years.at(-2) ?? "Previous FY"}
              fill={colorAt(5)}
              radius={[0, 4, 4, 0]}
              maxBarSize={16}
              onClick={(entry: { name?: string }) => entry?.name && toggleValue("states", entry.name)}
              cursor="pointer"
            />
            <Bar
              dataKey="latest"
              name={years.at(-1) ?? "Latest FY"}
              fill={colorAt(0)}
              radius={[0, 4, 4, 0]}
              maxBarSize={16}
              onClick={(entry: { name?: string }) => entry?.name && toggleValue("states", entry.name)}
              cursor="pointer"
            >
              <LabelList
                dataKey="latest"
                position="right"
                content={(props) => {
                  const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props as {
                    x?: number; y?: number; width?: number; height?: number; index?: number;
                  };
                  const row = comparison[index];
                  if (!row) return null;
                  const change = row.previous > 0 ? ((row.latest - row.previous) / row.previous) * 100 : null;
                  return (
                    <text
                      x={Number(x) + Number(width) + 6}
                      y={Number(y) + Number(height) / 2}
                      dominantBaseline="central"
                      fontSize={12}
                      fill="var(--text)"
                    >
                      {formatCrore(row.latest, false)}
                      {change === null ? "" : `  ${formatSignedPercent(change)}`}
                    </text>
                  );
                }}
              />
            </Bar>
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
            <CardTitle>Districts Ranked by Total CSR Spent</CardTitle>
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

      <ProjectRegisterSection
        filterQuery={filterQuery}
        label="Projects behind these states"
        description="Every disclosed project inside the current geographic scope. Click a state on the map or a row in the tables above to narrow it."
        scopeSpend={summary.data?.kpis.totalSpend}
      />
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
