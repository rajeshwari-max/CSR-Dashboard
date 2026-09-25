"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, FileText, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { ProjectRegisterSection } from "@/components/dashboard/project-register-section";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatPercent, formatShare, formatSignedPercent } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { CompanyDetail, ComparisonResponse, SummaryResponse } from "@/types";

const REPORT_KEYS = [
  ["csrReportUrl", "CSR report"],
  ["brsrReportUrl", "BRSR report"],
  ["annualReportUrl", "Annual report"],
  ["policyUrl", "CSR policy"],
] as const;

export function CompanyAnalysisView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const setValues = useFilterStore((state) => state.setValues);
  const meta = useMeta();

  // The company list is driven by the filter bar's search box — the page has no
  // search field of its own, so there is exactly one place to type a company
  // name and it filters the list, the charts and the register together.
  const [compare, setCompare] = React.useState<string[]>([]);

  React.useEffect(() => {
    setCompare(filters.companies.slice(0, 4));
  }, [filters.companies]);

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=50`);
  const comparison = useApi<ComparisonResponse>(
    compare.length ? `/api/compare?companies=${compare.map(encodeURIComponent).join("|")}&${filterQuery}` : null,
  );

  const toggleCompare = (id: string) => {
    const next = compare.includes(id)
      ? compare.filter((x) => x !== id)
      : compare.length >= 4
        ? compare
        : [...compare, id];
    setCompare(next);
    setValues("companies", next);
  };

  const chartData = React.useMemo(() => {
    const rows = comparison.data?.companies ?? [];
    return (comparison.data?.years ?? []).map((year) => {
      const entry: Record<string, string | number> = { year };
      for (const company of rows) entry[company.name] = company.byYear[year] ?? 0;
      return entry;
    });
  }, [comparison.data]);

  return (
    <PageFrame
      title="Company Analysis"
      subtitle={`Search, benchmark and compare filers · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        comparison.refetch();
      }}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>Company search and analysis</SectionLabel>
      <div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top filers in this view</CardTitle>
              <CardDescription>Use the common search above, then click a row to analyse that company</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BreakdownTable
              rows={summary.data?.topCompanies ?? []}
              label="Company"
              limit={20}
              selected={[]}
              onSelect={(name) => {
                const match = (summary.data?.topCompanies ?? []).find((row) => row.name === name);
                if (match?.id) setValues("companies", [match.id]);
              }}
              latestLabel={summary.data?.kpis.latestYear ?? undefined}
              columns={["value", "share", "count", "latest", "yoy"]}
            />
          </CardContent>
        </Card>
      </div>

      {compare.length === 1 ? <CompanyProfile companyId={compare[0]} filterQuery={filterQuery} /> : null}

      <SectionLabel>Company comparison</SectionLabel>
      {compare.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select companies from the Company filter above to benchmark them side by side.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(comparison.data?.companies ?? []).map((company, index) => (
              <span
                key={company.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
              >
                <span className="size-2 rounded-full" style={{ background: colorAt(index) }} />
                {company.name}
                <button type="button" onClick={() => toggleCompare(company.id)} aria-label={`Remove ${company.name}`}>
                  <X className="size-3 text-muted-foreground hover:text-foreground" />
                </button>
              </span>
            ))}
            <Button variant="ghost" size="xs" onClick={() => setValues("companies", [])}>
              Clear all
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <ChartCard
              title="Amount spent by financial year"
              description="Selected companies"
              className="xl:col-span-2"
              height={320}
              isLoading={comparison.isLoading}
              error={comparison.error}
              isEmpty={!chartData.length}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" {...AXIS_PROPS} label={{ value: "Financial year", position: "insideBottom", offset: -2 }} />
                  <YAxis {...AXIS_PROPS} label={{ value: "Amount spent (₹ Cr)", angle: -90, position: "insideLeft" }} />
                  <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => formatCrore(value)} />
                  <Legend iconType="circle" iconSize={8} />
                  {(comparison.data?.companies ?? []).map((company, index) => (
                    <Bar
                      key={company.id}
                      dataKey={company.name}
                      fill={colorAt(index)}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={34}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card className="xl:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Benchmark</CardTitle>
                  <CardDescription>Compliance uses the disclosed 2%-of-net-profit obligation</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-40">Company</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Latest FY</TableHead>
                      <TableHead className="text-right">YoY</TableHead>
                      <TableHead className="text-right">Projects</TableHead>
                      <TableHead className="text-right">States</TableHead>
                      <TableHead className="text-right">Obligation use</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(comparison.data?.companies ?? []).map((company) => (
                      <TableRow key={company.id}>
                        <TableCell>
                          <Link href={`/companies/${company.id}`} className="text-[13px] font-medium hover:text-primary">
                            {company.name}
                          </Link>
                          <span className="block text-[11px] text-muted-foreground">{company.sector}</span>
                        </TableCell>
                        <TableCell className="numeric text-right text-[13px]">{formatCrore(company.totalSpend)}</TableCell>
                        <TableCell className="numeric text-right text-[13px]">{formatCrore(company.latestYearSpend)}</TableCell>
                        <TableCell className="text-right">
                          {company.yoyGrowthPct === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={company.yoyGrowthPct >= 0 ? "success" : "danger"}>
                              {formatSignedPercent(company.yoyGrowthPct)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="numeric text-right text-[13px]">{formatNumber(company.projectCount)}</TableCell>
                        <TableCell className="numeric text-right text-[13px]">{company.stateCount}</TableCell>
                        <TableCell className="numeric text-right text-[13px]">
                          {formatPercent(company.utilisationPct)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <SectionLabel>Sector distribution &amp; disclosure documents</SectionLabel>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Companies by sector</CardTitle>
              <CardDescription>Filers and amount spent per BRSR sector in this view</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BreakdownTable
              rows={summary.data?.bySector ?? []}
              label="Sector"
              limit={15}
              columns={["companies", "value", "share"]}
              selected={filters.sectors}
              onSelect={(name) => setValues("sectors", [name])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Download annual reports</CardTitle>
              <CardDescription>Source filings disclosed by the top companies in view</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="max-h-[26rem] space-y-2 overflow-y-auto">
            {(summary.data?.topCompanies ?? []).slice(0, 15).map((row) => (
              <CompanyLinks key={row.id ?? row.name} companyId={row.id ?? ""} name={row.name} value={row.value} />
            ))}
          </CardContent>
        </Card>
      </div>

      <ProjectRegisterSection
        filterQuery={filterQuery}
        label="Projects for the selected companies"
        description="Every disclosed project inside the current scope. Use the Company filter above to narrow it."
        scopeSpend={summary.data?.kpis.totalSpend}
      />
    </PageFrame>
  );
}

function CompanyLinks({ companyId, name, value }: { companyId: string; name: string; value: number }) {
  // Lazily loaded: rendering 15 of these eagerly meant 15 concurrent requests,
  // each running a national ranking. Now nothing is fetched until expanded.
  const [expanded, setExpanded] = React.useState(false);
  const detail = useApi<{ company: Record<string, string | null> }>(
    expanded && companyId ? `/api/companies/${encodeURIComponent(companyId)}` : null,
  );
  const company = detail.data?.company;

  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/companies/${companyId}`} className="truncate text-[13px] font-medium hover:text-primary">
          {name}
        </Link>
        <span className="numeric shrink-0 text-xs text-muted-foreground">{formatCrore(value)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            Show disclosure documents
          </button>
        ) : detail.isLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          (() => {
            const links = REPORT_KEYS.filter(([key]) => {
              const href = company?.[key];
              return typeof href === "string" && href.startsWith("http");
            });
            if (!links.length) {
              return <span className="text-[11px] text-muted-foreground">No document links disclosed</span>;
            }
            return links.map(([key, label]) => (
              <a
                key={key}
                href={company?.[key] as string}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <FileText className="size-3" />
                {label}
                <ExternalLink className="size-2.5" />
              </a>
            ));
          })()
        )}
      </div>
    </div>
  );
}

/**
 * Everything the tab was missing: when exactly one company is selected, this
 * renders that company's own analysis — headline numbers, its spend trajectory,
 * where the money went by Schedule VII category and by state, how it sits
 * against sector peers, and its biggest projects.
 *
 * It reads /api/companies/:id, which scopes to the company but deliberately
 * drops the sector facet (a company has one sector; filtering by another would
 * empty the page) and keeps year/state/theme so the profile still respects the
 * filter bar.
 */
function CompanyProfile({ companyId, filterQuery }: { companyId: string; filterQuery: string }) {
  const detail = useApi<CompanyDetail>(
    `/api/companies/${encodeURIComponent(companyId)}?${filterQuery}`,
  );
  const data = detail.data;

  const trendData = React.useMemo(
    () => (data?.trend ?? []).map((point) => ({ year: point.year, spend: point.spend, projects: point.projects })),
    [data?.trend],
  );

  if (detail.isLoading && !data) {
    return (
      <>
        <SectionLabel>Company profile</SectionLabel>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </>
    );
  }

  if (!data) return null;
  // Narrowed after the guard, so every field below is non-optional.
  const kpis = data.kpis;

  return (
    <>
      <SectionLabel>Company profile — {data.company.name}</SectionLabel>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ProfileStat label="Total CSR amount spent" value={formatCrore(kpis.totalSpend)} sub="All years in view" />
        <ProfileStat
          label="Latest FY amount spent"
          value={formatCrore(kpis.latestYearSpend)}
          sub={
            kpis.yoyGrowthPct === null
              ? "No prior year to compare"
              : `${formatSignedPercent(kpis.yoyGrowthPct)} vs. prior year`
          }
        />
        <ProfileStat
          label="Projects"
          value={formatNumber(kpis.projectCount)}
          sub={`${kpis.themeCount} Schedule VII categories`}
        />
        <ProfileStat
          label="Geographic reach"
          value={formatNumber(kpis.stateCount)}
          sub={
            kpis.sectorRank
              ? `#${kpis.sectorRank} in ${data.company.sector}`
              : "States and UTs receiving funds"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <ChartCard
          title="Amount spent trajectory"
          description="This company's disclosed amount spent per financial year"
          className="xl:col-span-3"
          height={300}
          isLoading={detail.isLoading}
          error={detail.error}
          isEmpty={trendData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 8, right: 12, bottom: 22, left: 18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" {...AXIS_PROPS} label={{ value: "Financial year", position: "insideBottom", offset: -12 }} />
              <YAxis {...AXIS_PROPS} tickFormatter={(value: number) => formatCrore(value, false)} width={72} label={{ value: "Amount spent (₹ Cr)", angle: -90, position: "insideLeft", offset: -8 }} />
              <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => formatCrore(value)} />
              <Bar dataKey="spend" name="Amount spent" fill={colorAt(0)} radius={[5, 5, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Where the money goes</CardTitle>
              <CardDescription>Schedule VII categories, largest first</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BreakdownTable
              rows={data.byTheme}
              label="Category"
              limit={10}
              showBars
              columns={["value", "share", "count"]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>States reached</CardTitle>
              <CardDescription>Amount spent by state, largest first</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BreakdownTable
              rows={data.byState}
              label="State"
              limit={12}
              showBars
              columns={["value", "share", "count"]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sector peers</CardTitle>
              <CardDescription>
                Other {data.company.sector} filers, ranked on national amount spent
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <BreakdownTable
              rows={data.peers}
              label="Company"
              limit={8}
              showBars
              selected={[data.company.name]}
              columns={["value", "count", "yoy"]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Largest projects</CardTitle>
            <CardDescription>Top 25 by amount spent, within the current filters</CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">
            {formatNumber(data.topProjects.length)} shown
          </Badge>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-64">Project</TableHead>
                <TableHead>FY</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topProjects.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No projects match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.topProjects.slice(0, 25).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-[13px]">{row.project ?? "—"}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{row.theme}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{row.state}</TableCell>
                    <TableCell className="numeric text-right text-[13px]">{formatCrore(row.spent)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function ProfileStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value mt-2 text-xl">{value}</p>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{sub}</p>
    </Card>
  );
}
