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
  Treemap,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { ChartTip } from "@/components/charts2/chart-tooltip";
import { SectorPieChart } from "@/components/charts/sector-pie-chart";
import { ProjectRegisterSection } from "@/components/dashboard/project-register-section";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatSignedPercent, truncate } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { BreakdownResponse, SummaryResponse } from "@/types";

export function SectorAnalysisView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);
  const sectorSeries = useApi<BreakdownResponse>(`/api/breakdown?dimension=sector&${filterQuery}&limit=60`);

  const sectors = React.useMemo(() => summary.data?.bySector ?? [], [summary.data]);
  const themes = React.useMemo(() => summary.data?.byTheme ?? [], [summary.data]);
  const years = React.useMemo(
    () => summary.data?.trend.map((point) => point.year) ?? [],
    [summary.data],
  );

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
              <Tooltip content={<ChartTip money />} cursor={TOOLTIP_STYLES.cursor} />
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
                    fill={(row.yoyGrowthPct ?? 0) >= 0 ? "var(--success)" : "var(--danger)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Funding flow</CardTitle>
              <CardDescription>Which Schedule VII categories absorb the spend in this view</CardDescription>
            </div>
            <Badge variant="outline">{themes.length} categories</Badge>
          </CardHeader>
          <CardContent className="h-[310px] pb-5">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={flow}
                dataKey="value"
                nameKey="name"
                stroke="var(--surface)"
                content={<FundingTreemapNode selected={filters.themes} />}
                onClick={(node: { name?: string }) => node?.name && toggleValue("themes", node.name)}
              >
                <Tooltip
                  {...TOOLTIP_STYLES}
                  formatter={(value: number, name: string) => [formatCrore(value), name]}
                />
              </Treemap>
            </ResponsiveContainer>
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

      <ProjectRegisterSection
        filterQuery={filterQuery}
        label="Projects behind these sectors"
        description="Every disclosed project inside the current sector and Schedule VII scope. Click a slice, a category or a table row above to narrow it."
        scopeSpend={summary.data?.kpis.totalSpend}
      />
    </PageFrame>
  );
}

interface FundingNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  value?: number;
  share?: number;
  depth?: number;
  selected: string[];
}

function FundingTreemapNode({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  name = "",
  value = 0,
  share = 0,
  depth = 1,
  selected,
}: FundingNodeProps) {
  if (depth !== 1) return null;
  const active = selected.length === 0 || selected.includes(name);
  const showLabel = width > 90 && height > 45;
  const showValue = width > 120 && height > 68;
  return (
    <g className="cursor-pointer">
      <rect
        x={x}
        y={y}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={8}
        fill={colorAt(index)}
        fillOpacity={active ? 0.88 : 0.32}
        stroke={active && selected.includes(name) ? "var(--text)" : "var(--surface)"}
        strokeWidth={active && selected.includes(name) ? 2.5 : 2}
      />
      {showLabel ? (
        <text x={x + 10} y={y + 20} fill="white" fontSize={11} fontWeight={700}>
          {truncate(name, Math.max(12, Math.floor(width / 8)))}
        </text>
      ) : null}
      {showValue ? (
        <text x={x + 10} y={y + 39} fill="white" fontSize={10} opacity={0.9}>
          {formatCrore(value)} · {(share * 100).toFixed(1)}%
        </text>
      ) : null}
    </g>
  );
}
