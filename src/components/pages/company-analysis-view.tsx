"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, FileText, Search, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/store/filters";
import type { ComparisonResponse, SummaryResponse } from "@/types";

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

  const [term, setTerm] = React.useState("");
  const [compare, setCompare] = React.useState<string[]>([]);

  React.useEffect(() => {
    setCompare(filters.companies.slice(0, 4));
  }, [filters.companies]);

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=50`);
  const comparison = useApi<ComparisonResponse>(
    compare.length ? `/api/compare?companies=${compare.map(encodeURIComponent).join("|")}&${filterQuery}` : null,
  );

  const matches = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    const list = meta.data?.companies ?? [];
    if (!needle) return list.slice(0, 40);
    return list
      .filter((c) => c.name.toLowerCase().includes(needle) || c.sector.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [meta.data, term]);

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
      hideFacets={["companies"]}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        comparison.refetch();
      }}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>Company search and analysis</SectionLabel>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Find a company</CardTitle>
              <CardDescription>
                {formatNumber(meta.data?.companyCount ?? 0)} filers · tick up to 4 to compare
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search company or sector…"
                aria-label="Search companies"
                className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {meta.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
                {matches.map((company) => {
                  const checked = compare.includes(company.id);
                  return (
                    <div
                      key={company.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-accent/40",
                        checked && "border-primary/40 bg-accent/50",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCompare(company.id)}
                        aria-label={`Compare ${company.name}`}
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded border border-input text-[10px]",
                          checked && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {checked ? "✓" : ""}
                      </button>
                      <span className="min-w-0 flex-1 truncate">{company.name}</span>
                      <Badge variant="muted" className="shrink-0 max-w-28 truncate">
                        {company.sector}
                      </Badge>
                      <Link
                        href={`/companies/${encodeURIComponent(company.id)}`}
                        className="shrink-0 text-muted-foreground hover:text-primary"
                        aria-label={`Open ${company.name}`}
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </div>
                  );
                })}
                {matches.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No companies match “{term}”.</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Top filers in this view</CardTitle>
              <CardDescription>Click a row to filter the dashboard to that company</CardDescription>
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

      <SectionLabel>Company comparison</SectionLabel>
      {compare.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Tick up to four companies on the left to benchmark them side by side.
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
            <Button variant="ghost" size="xs" onClick={() => setCompare([])}>
              Clear all
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <ChartCard
              title="Spend by financial year"
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
                  <XAxis dataKey="year" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} />
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
              <CardDescription>Filers and spend per BRSR sector in this view</CardDescription>
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

      <ProjectRegisterSection filterQuery={filterQuery} />
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
