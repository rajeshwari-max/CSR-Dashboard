"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { RankList } from "@/components/charts/rank-list";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { Unavailable } from "@/components/shared/unavailable";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { ProjectsResponse, SortDirection, SortField, SummaryResponse } from "@/types";

/** Log-ish buckets: CSR project sizes span five orders of magnitude. */
const BUCKETS = [
  { label: "< ₹10 L", min: 0, max: 0.1 },
  { label: "₹10 L – ₹50 L", min: 0.1, max: 0.5 },
  { label: "₹50 L – ₹1 Cr", min: 0.5, max: 1 },
  { label: "₹1 – 5 Cr", min: 1, max: 5 },
  { label: "₹5 – 25 Cr", min: 5, max: 25 },
  { label: "> ₹25 Cr", min: 25, max: Number.POSITIVE_INFINITY },
];

export function ProjectAnalyticsView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const setRange = useFilterStore((state) => state.setRange);
  const meta = useMeta();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [sort, setSort] = React.useState<SortField>("spent");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  React.useEffect(() => setPage(1), [filterQuery, pageSize, sort, direction]);

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=15`);
  const projects = useApi<ProjectsResponse>(
    `/api/projects?${filterQuery}&page=${page}&pageSize=${pageSize}&sort=${sort}&direction=${direction}`,
  );

  // One request per bucket would be wasteful; the histogram is derived from the
  // sampled first page plus the aggregate KPIs instead of a full scan.
  const sizes = useApi<ProjectsResponse>(`/api/projects?${filterQuery}&page=1&pageSize=200&sort=spent&direction=desc`);

  const kpis = summary.data?.kpis;
  const capabilities = meta.data?.capabilities;

  const histogram = React.useMemo(() => {
    const rows = sizes.data?.rows ?? [];
    return BUCKETS.map((bucket) => {
      const matching = rows.filter(
        (row) => row.spent !== null && row.spent >= bucket.min && row.spent < bucket.max,
      );
      return {
        label: bucket.label,
        projects: matching.length,
        value: matching.reduce((sum, row) => sum + (row.spent ?? 0), 0),
        min: bucket.min,
        max: bucket.max,
      };
    });
  }, [sizes.data]);

  const handleSort = (field: SortField) => {
    if (field === sort) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDirection(field === "spent" || field === "outlay" ? "desc" : "asc");
    }
  };

  return (
    <PageFrame
      title="Project Analytics"
      subtitle={`Project-level view · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        projects.refetch();
        sizes.refetch();
      }}
      isRefreshing={summary.isValidating || projects.isValidating}
    >
      <SectionLabel>Project profile</SectionLabel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Projects in view" value={formatNumber(kpis?.projectCount ?? 0)} sub={`${formatNumber(kpis?.companyCount ?? 0)} companies`} />
        <Stat label="Average project size" value={formatCrore(kpis?.avgProjectSize ?? 0)} sub="Mean disclosed amount" />
        <Stat
          label="Aspirational districts"
          value={formatCrore(kpis?.aspirationalSpend ?? 0)}
          sub={`${formatShare(kpis?.aspirationalShare ?? 0)} of spend in view`}
        />
        <Stat
          label="Districts reached"
          value={formatNumber(kpis?.districtCount ?? 0)}
          sub={`${kpis?.stateCount ?? 0} states`}
        />
      </div>

      <SectionLabel>Budget utilization</SectionLabel>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex flex-col gap-1 py-4 text-sm">
          <p className="font-medium">Outlay vs. spent cannot be computed reliably on this dataset</p>
          <p className="text-muted-foreground">
            For part of FY 2020-21 the workbook repeats a company-level outlay on every project row (HDFC&rsquo;s
            ₹407.74 Cr appears on ~200 rows), so summing the outlay column overstates budgets several-fold. The
            per-project outlay is still shown in the register below exactly as disclosed. A per-project outlay
            column filled consistently across years would switch this panel on.
          </p>
        </CardContent>
      </Card>

      <SectionLabel>Distribution &amp; impact</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Project size distribution"
          description="Largest 200 projects in view · click a bar to filter by amount"
          className="xl:col-span-2"
          height={320}
          isLoading={sizes.isLoading}
          error={sizes.error}
          isEmpty={!histogram.some((bucket) => bucket.projects > 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} />
              <Tooltip
                {...TOOLTIP_STYLES}
                formatter={(value: number, name: string) =>
                  name === "projects" ? [formatNumber(value), "Projects"] : [formatCrore(value), "Spend"]
                }
              />
              <Bar
                dataKey="projects"
                radius={[6, 6, 0, 0]}
                maxBarSize={60}
                cursor="pointer"
                onClick={(entry: { payload?: { min: number; max: number } }) => {
                  const bucket = entry?.payload;
                  if (bucket) setRange(bucket.min, Number.isFinite(bucket.max) ? bucket.max : null);
                }}
              >
                {histogram.map((bucket, index) => (
                  <Cell key={bucket.label} fill={colorAt(index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Project locations"
          description="Districts with the most recorded spend"
          height={320}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!summary.data?.byDistrict.length}
        >
          <RankList
            data={summary.data?.byDistrict ?? []}
            limit={12}
            onSelect={(name) => toggleValue("districts", name)}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {capabilities?.beneficiaries ? (
          <ChartCard title="Beneficiaries &amp; impact metrics" height={300} isLoading={false}>
            <div />
          </ChartCard>
        ) : (
          <Unavailable
            title="Beneficiaries & impact metrics"
            column="beneficiaries"
            description="No headcount or impact-metric column in the source data"
            headers={["Beneficiaries", "Beneficiaries Reached", "No. of Beneficiaries", "Lives Impacted"]}
            height={200}
          />
        )}

        {capabilities?.start_date || capabilities?.status ? (
          <ChartCard title="Timeline" height={300} isLoading={false}>
            <div />
          </ChartCard>
        ) : (
          <Unavailable
            title="Project timeline & status"
            column="start / end date or status"
            description="Disclosures are annual totals with no project dates or status"
            headers={["Start Date", "End Date", "Project Status", "Project Duration"]}
            height={200}
          />
        )}
      </div>

      <SectionLabel>Project register</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Sorted by {sort}</Badge>
        {filters.minSpend !== null || filters.maxSpend !== null ? (
          <Badge variant="default">
            Amount {filters.minSpend ?? 0} – {filters.maxSpend ?? "∞"} Cr
          </Badge>
        ) : null}
      </div>
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
    </PageFrame>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-5">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value mt-3">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}
