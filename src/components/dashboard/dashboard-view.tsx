"use client";

import * as React from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { CompanyBarChart } from "@/components/charts/company-bar-chart";
import { IndiaMap } from "@/components/charts/india-map";
import { RankList } from "@/components/charts/rank-list";
import { SectorPieChart } from "@/components/charts/sector-pie-chart";
import { YearTrendChart } from "@/components/charts/year-trend-chart";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { ProjectsResponse, SortDirection, SortField, SummaryResponse } from "@/types";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function DashboardView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [sort, setSort] = React.useState<SortField>("spent");
  const [direction, setDirection] = React.useState<SortDirection>("desc");

  React.useEffect(() => setPage(1), [filterQuery, pageSize, sort, direction]);

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=12`);
  const projects = useApi<ProjectsResponse>(
    `/api/projects?${filterQuery}&page=${page}&pageSize=${pageSize}&sort=${sort}&direction=${direction}`,
  );

  const handleSort = (field: SortField) => {
    if (field === sort) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDirection(field === "spent" || field === "outlay" ? "desc" : "asc");
    }
  };

  const isLoading = summary.isLoading;

  return (
    <PageFrame
      title="Executive Dashboard"
      subtitle={
        meta.data
          ? `${formatNumber(meta.data.rowCount)} projects · ${formatNumber(meta.data.companyCount)} companies · ${scope}`
          : "Loading CSR disclosures…"
      }
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        meta.refetch();
        summary.refetch();
        projects.refetch();
      }}
      isRefreshing={summary.isValidating || projects.isValidating}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/ai-insights?${filterQuery}`}>
            <Sparkles className="size-4" />
            Analyse trends
          </Link>
        </Button>
      }
    >
      <SectionLabel>Key performance indicators</SectionLabel>
      <KpiCards kpis={summary.data?.kpis ?? null} isLoading={isLoading} />

      <SectionLabel>Trend &amp; distribution analysis</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          id="trend"
          title="CSR Spending Trend"
          description="Amount spent, with project volume and reporting-company count"
          badge={summary.data?.kpis.latestYear ?? undefined}
          className="xl:col-span-2"
          height={320}
          isLoading={isLoading}
          error={summary.error}
          isEmpty={!summary.data?.trend.length}
        >
          <YearTrendChart data={summary.data?.trend ?? []} />
        </ChartCard>

        <ChartCard
          id="sectors"
          title="Top Sectors"
          description="Share of spend by BRSR sector"
          height={320}
          isLoading={isLoading}
          error={summary.error}
          isEmpty={!summary.data?.bySector.length}
        >
          <SectorPieChart data={summary.data?.bySector ?? []} onSelect={(name) => toggleValue("sectors", name)} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Top Companies by CSR Spend"
          description="Click a bar to open the company drill-down"
          badge="Top 12"
          className="xl:col-span-2"
          height={420}
          isLoading={isLoading}
          error={summary.error}
          isEmpty={!summary.data?.topCompanies.length}
        >
          <CompanyBarChart data={summary.data?.topCompanies ?? []} />
        </ChartCard>

        <ChartCard
          title="Schedule VII Categories"
          description="Where the money goes"
          height={420}
          isLoading={isLoading}
          error={summary.error}
          isEmpty={!summary.data?.byTheme.length}
        >
          <RankList data={summary.data?.byTheme ?? []} limit={12} onSelect={(name) => toggleValue("themes", name)} />
        </ChartCard>
      </div>

      <SectionLabel>Geographic distribution</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          id="geography"
          title="State-wise CSR Spend"
          description="Click a state to filter the whole dashboard"
          className="xl:col-span-2"
          height={460}
          isLoading={isLoading}
          error={summary.error}
          isEmpty={!summary.data?.byState.length}
        >
          <IndiaMap
            data={summary.data?.byState ?? []}
            selected={filters.states}
            onSelect={(name) => toggleValue("states", name)}
          />
        </ChartCard>

        <ChartCard
          title="Top States"
          description="Ranked by amount spent"
          height={460}
          isLoading={isLoading}
          error={summary.error}
          isEmpty={!summary.data?.byState.length}
        >
          <RankList data={summary.data?.byState ?? []} limit={14} onSelect={(name) => toggleValue("states", name)} />
        </ChartCard>
      </div>

      <SectionLabel>Project register</SectionLabel>
      <ProjectsTable
        data={projects.data}
        isLoading={projects.isLoading}
        error={projects.error}
        sort={sort}
        direction={direction}
        page={page}
        pageSize={pageSize}
        onSortChange={handleSort}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        {meta.data?.sources.map((source) => source.file).join(", ") ?? "CSR database"} · dataset built{" "}
        {formatDateTime(meta.data?.generatedAt)} · all amounts in INR Crore
      </p>
    </PageFrame>
  );
}
