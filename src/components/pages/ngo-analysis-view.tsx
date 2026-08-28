"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { RankList } from "@/components/charts/rank-list";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatShare } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { BreakdownResponse, SummaryResponse } from "@/types";

/**
 * The mockup calls this "NGO Analysis". The workbook has no implementing-agency
 * *names* — only the Schedule VII "mode of implementation" (direct, own trust,
 * government trust, other agency). So the page analyses what exists and states
 * plainly what does not.
 */
export function NgoAnalysisView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=10`);
  const modeSeries = useApi<BreakdownResponse>(`/api/breakdown?dimension=mode&${filterQuery}`);

  const modes = summary.data?.byMode ?? [];
  const throughAgencies = modes
    .filter((row) => /agenc|trust|societ|section 8/i.test(row.name))
    .reduce((sum, row) => sum + row.value, 0);
  const total = modes.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <PageFrame
      title="Implementation Analysis"
      subtitle={`How CSR money is delivered · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        modeSeries.refetch();
      }}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>Delivery channel</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Mode of implementation"
          description="Share of spend by delivery channel"
          height={320}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!modes.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={modes}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={1.5}
                stroke="var(--surface)"
                strokeWidth={2}
                cursor="pointer"
                onClick={(entry: { name?: string }) => entry?.name && toggleValue("modes", entry.name)}
              >
                {modes.map((row, index) => (
                  <Cell key={row.name} fill={colorAt(index)} />
                ))}
              </Pie>
              <Tooltip
                {...TOOLTIP_STYLES}
                formatter={(value: number, name: string) => [formatCrore(value), name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Channel summary</CardTitle>
              <CardDescription>
                {formatShare(throughAgencies / total)} of spend in this view is routed through an external agency,
                trust or Section 8 company rather than executed directly
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BreakdownTable
              rows={modes}
              label="Mode of implementation"
              limit={12}
              selected={filters.modes}
              onSelect={(name) => toggleValue("modes", name)}
              columns={["value", "share", "count", "companies", "yoy"]}
            />
          </CardContent>
        </Card>
      </div>

      <SectionLabel>Where agency-delivered money goes</SectionLabel>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="State presence"
          description="States reached by projects in this view"
          height={360}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!summary.data?.byState.length}
        >
          <RankList
            data={summary.data?.byState ?? []}
            limit={12}
            onSelect={(name) => toggleValue("states", name)}
          />
        </ChartCard>

        <ChartCard
          title="Focus areas"
          description="Schedule VII categories delivered in this view"
          height={360}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!summary.data?.byTheme.length}
        >
          <RankList
            data={summary.data?.byTheme ?? []}
            limit={12}
            onSelect={(name) => toggleValue("themes", name)}
          />
        </ChartCard>
      </div>
    </PageFrame>
  );
}
