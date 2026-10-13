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
import type { PolicyInsights } from "@/lib/policy";
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
  const policy = useApi<PolicyInsights>(`/api/policy?${filterQuery}`);
  const partners = policy.data?.partners ?? null;
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
      <SectionLabel>Organisations receiving CSR funds</SectionLabel>
      {partners ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <OrgCard
            title="Implementing Agencies Awarded the Most CSR Funds"
            description={`From uploaded partner data (${partners.records.toLocaleString("en-IN")} project rows) · ${partners.implementers} ${partners.implementers === 1 ? "agency" : "agencies"}`}
            rows={partners.top}
            empty="No implementation rows in the uploaded partner data for this selection."
          />
          <OrgCard
            title="Agencies Engaged for M&E and Impact Assessment"
            description={`Rows uploaded with Role = M&E · ${partners.evaluatorCount} ${partners.evaluatorCount === 1 ? "agency" : "agencies"}`}
            rows={partners.evaluators}
            empty="No M&E rows uploaded yet. Add evaluation or impact assessment agencies (from companies' impact assessment reports) with Role = M&E in the partners template."
          />
        </div>
      ) : null}
      <Card className="border-dashed p-4 text-[13px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Where these names come from.</strong> The MCA project filings record only the
        delivery channel (directly, own trust or Section 8 company, government body, or other implementing agency), not the
        name of the implementing agency or of any monitoring and evaluation (M&amp;E) partner. Names are added from
        companies&apos; CSR annexures (implementing agencies, with CSR-1 registration numbers) and impact assessment reports
        (M&amp;E agencies) through the partners template on{" "}
        <a href="/policy-insights" className="font-medium text-primary underline">Policy Insights</a>
        {partners ? "." : ". None have been uploaded yet, so the lists of organisations appear here once they are."}
      </Card>

      <SectionLabel>Delivery channel</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Implementation Channels by Total CSR Spent"
          description="Share of amount spent by delivery channel"
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
              <CardTitle>Implementation Channels Summary</CardTitle>
              <CardDescription>
                {formatShare(throughAgencies / total)} of amount spent in this view is routed through an external agency,
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
          title="Implementation Channel Presence by State"
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
          title="Schedule VII Focus Areas by Implementation Channel"
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

function OrgCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: { name: string; value: number; companies: number; states: number; registration: string | null }[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          <ol className="space-y-1.5 text-[13px]">
            {rows.slice(0, 10).map((row, index) => (
              <li key={row.name} className="flex justify-between gap-3">
                <span className="truncate">
                  {index + 1}. {row.name}
                  {row.registration ? <span className="text-muted-foreground"> · {row.registration}</span> : null}
                </span>
                <span className="numeric shrink-0">
                  {formatCrore(row.value)} · {row.companies} {row.companies === 1 ? "company" : "companies"} · {row.states} {row.states === 1 ? "state" : "states"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
