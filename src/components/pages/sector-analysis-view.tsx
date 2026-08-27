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

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { SectorPieChart } from "@/components/charts/sector-pie-chart";
import { ProjectRegisterSection } from "@/components/dashboard/project-register-section";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatShare, formatSignedPercent, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/store/filters";
import type { BreakdownResponse, SummaryResponse } from "@/types";

export function SectorAnalysisView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);
  const sectorSeries = useApi<BreakdownResponse>(`/api/breakdown?dimension=sector&${filterQuery}&limit=60`);

  const sectors = summary.data?.bySector ?? [];
  const themes = summary.data?.byTheme ?? [];
  const years = summary.data?.trend.map((point) => point.year) ?? [];

  const trendData = React.useMemo(() => {
    const top = sectors.slice(0, 6).map((row) => row.name);
    const byName = new Map((sectorSeries.data?.series ?? []).map((item) => [item.name, item.values]));
    return years.map((year) => {
      const entry: Record<string, string | number> = { year };
      for (const name of top) entry[name] = byName.get(name)?.[year] ?? 0;
      return entry;
    });
  }, [sectors, sectorSeries.data, years]);

  const growth = React.useMemo(
    () =>
      sectors
        .filter((row) => (row.previous ?? 0) >= 5 && row.yoyGrowthPct !== null)
        .sort((a, b) => (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0)),
    [sectors],
  );

  // Funding flow: which Schedule VII categories each top sector funds.
  const flow = React.useMemo(() => {
    const totalTheme = themes.reduce((sum, row) => sum + row.value, 0) || 1;
    return themes.slice(0, 10).map((row) => ({
      name: row.name,
      value: row.value,
      share: row.value / totalTheme,
      count: row.count ?? 0,
    }));
  }, [themes]);

  return (
    <PageFrame
      title="Sector Analysis"
      subtitle={`How CSR spend splits across BRSR sectors · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        sectorSeries.refetch();
      }}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>Sector overview</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Spend share by sector"
          description="Top sectors, remainder grouped"
          height={340}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!sectors.length}
        >
          <SectorPieChart data={sectors} onSelect={(name) => toggleValue("sectors", name)} />
        </ChartCard>

        <ChartCard
          title="Sector trajectories"
          description="Top 6 sectors across financial years"
          className="xl:col-span-2"
          height={340}
          isLoading={summary.isLoading || sectorSeries.isLoading}
          error={summary.error}
          isEmpty={!trendData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} />
              <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => formatCrore(value)} />
              <Legend iconType="circle" iconSize={8} />
              {sectors.slice(0, 6).map((sector, index) => (
                <Line
                  key={sector.name}
                  type="monotone"
                  dataKey={sector.name}
                  stroke={colorAt(index)}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <SectionLabel>Growth rate</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Year-on-year growth by sector"
          description="Sectors with at least ₹5 Cr in the prior year"
          height={380}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!growth.length}
          emptyMessage="Needs two financial years with comparable spend."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...growth.slice(0, 6), ...growth.slice(-6)]}
              layout="vertical"
              margin={{ top: 4, right: 30, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" {...AXIS_PROPS} tickFormatter={(value: number) => `${value}%`} />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                {...AXIS_PROPS}
                tickFormatter={(value: string) => truncate(value, 22)}
              />
              <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => formatSignedPercent(value)} />
              <Bar dataKey="yoyGrowthPct" radius={[0, 5, 5, 0]} maxBarSize={20}>
                {[...growth.slice(0, 6), ...growth.slice(-6)].map((row) => (
                  <Cell
                    key={row.name}
                    fill={(row.yoyGrowthPct ?? 0) >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Funding flow</CardTitle>
              <CardDescription>Which Schedule VII categories absorb the spend in this view</CardDescription>
            </div>
            <Badge variant="outline">{themes.length} categories</Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {flow.map((row, index) => (
              <button
                key={row.name}
                type="button"
                onClick={() => toggleValue("themes", row.name)}
                className={cn(
                  "w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
                  filters.themes.includes(row.name) && "bg-accent/60",
                )}
              >
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="numeric shrink-0 font-semibold">{formatCrore(row.value)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(2, row.share * 100)}%`, background: colorAt(index) }}
                    />
                  </span>
                  <span className="numeric w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                    {formatShare(row.share)}
                  </span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <SectionLabel>All sectors</SectionLabel>
      <Card>
        <CardContent className="px-0 pt-4">
          <BreakdownTable
            rows={sectors}
            label="Sector"
            limit={60}
            selected={filters.sectors}
            onSelect={(name) => toggleValue("sectors", name)}
            latestLabel={years[years.length - 1]}
            columns={["value", "share", "count", "companies", "latest", "yoy"]}
          />
        </CardContent>
      </Card>

      <ProjectRegisterSection filterQuery={filterQuery} />
    </PageFrame>
  );
}
