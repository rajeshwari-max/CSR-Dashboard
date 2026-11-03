"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES, xTitle } from "@/components/charts/chart-theme";
import { RankList } from "@/components/charts/rank-list";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare, truncate } from "@/lib/format";
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
        <div className={`grid grid-cols-1 gap-5 ${partners.evaluators.length ? "xl:grid-cols-2" : ""}`}>
          <OrgCard
            title={partners.amount > 0 ? "Implementing Agencies Awarded the Most CSR Funds" : "Top 15 Implementing Agencies by Number of Funding Companies"}
            description={`Each bar shows how many companies named the agency in their CSR annexure. ${partners.implementers.toLocaleString("en-IN")} agencies across ${partners.records.toLocaleString("en-IN")} annexure rows; hover for the CSR-1 registration number.`}
            rows={partners.top}
            empty="No implementation rows in the uploaded partner data for this selection."
          />
          {partners.evaluators.length ? (
          <OrgCard
              title="Agencies Engaged for M&E and Impact Assessment"
              description={`Rows uploaded with Role = M&E · ${partners.evaluatorCount} ${partners.evaluatorCount === 1 ? "agency" : "agencies"}`}
              rows={partners.evaluators}
              empty="CSR annexures do not name M&E agencies. Add them (from companies' impact assessment reports) with Role = M&E in the partners template."
            />
          ) : null}
        </div>
      ) : null}
      <Card className="border-dashed p-4 text-[13px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Source.</strong> Agency names and CSR-1 registration numbers are taken from the
        Annexure on CSR activities in each company&apos;s annual report (filed on NSE). The MCA National CSR Portal
        (csr.gov.in) records only the delivery channel, shown below.
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

/** Annexure names are sometimes pasted twice ("Akshaypatra Foundation Akshaypatra Foundation"). */
function cleanAgencyName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    if (words.slice(0, half).join(" ").toLowerCase() === words.slice(half).join(" ").toLowerCase()) return words.slice(0, half).join(" ");
  }
  return name.trim();
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
  const byAmount = rows.some((row) => row.value > 0);
  const data = rows.slice(0, 15).map((row) => ({ ...row, label: cleanAgencyName(row.name), metric: byAmount ? row.value : row.companies }));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          <div style={{ height: Math.max(260, data.length * 34 + 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, bottom: 22, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  {...AXIS_PROPS}
                  allowDecimals={false}
                  tickFormatter={(value: number) => (byAmount ? formatCrore(value, false) : formatNumber(value))}
                  label={xTitle(byAmount ? "CSR funds received (₹ crore)" : "Companies funding the agency (count)", -14)}
                />
                <YAxis type="category" dataKey="label" width={300} {...AXIS_PROPS} tick={{ fontSize: 12, fill: "var(--text)" }} tickFormatter={(value: string) => truncate(value, 44)} />
                <Tooltip
                  cursor={TOOLTIP_STYLES.cursor}
                  content={({ payload }) => {
                    const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!row) return null;
                    return (
                      <div style={{ ...TOOLTIP_STYLES.contentStyle, padding: "8px 10px", maxWidth: 340 }}>
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>{row.label}</p>
                        {row.registration ? <p>CSR-1 registration: {row.registration}</p> : null}
                        <p>Funded by {formatNumber(row.companies)} {row.companies === 1 ? "company" : "companies"}</p>
                        {row.value > 0 ? <p>CSR funds received: {formatCrore(row.value)}</p> : null}
                        {row.states > 0 ? <p>Working in {row.states} {row.states === 1 ? "state" : "states"}</p> : null}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="metric" radius={[0, 5, 5, 0]} maxBarSize={20}>
                  {data.map((row, index) => (
                    <Cell key={row.name} fill={index % 2 ? "var(--c2)" : "var(--c1)"} />
                  ))}
                  <LabelList
                    dataKey="metric"
                    position="right"
                    formatter={(value: number) => (byAmount ? formatCrore(value) : `${formatNumber(value)} ${value === 1 ? "company" : "companies"}`)}
                    style={{ fontSize: 11.5, fill: "var(--text)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
