"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  Target,
} from "lucide-react";

import { ChartCard } from "@/components/charts/chart-card";
import { RankList } from "@/components/charts/rank-list";
import { YearTrendChart } from "@/components/charts/year-trend-chart";
import { useSidebar } from "@/components/layout/app-shell";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiRequestError, downloadCsv, useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatPercent, formatShare, formatSignedPercent, truncate } from "@/lib/format";
import type { CompanyDetail } from "@/types";

const REPORT_LINKS: { key: keyof CompanyDetail["company"]; label: string }[] = [
  { key: "csrReportUrl", label: "CSR report" },
  { key: "brsrReportUrl", label: "BRSR report" },
  { key: "annualReportUrl", label: "Annual report" },
  { key: "policyUrl", label: "CSR policy" },
];

export function CompanyView({ companyId }: { companyId: string }) {
  const { openSidebar } = useSidebar();
  const { data, error, isLoading, refetch, isValidating } = useApi<CompanyDetail>(
    `/api/companies/${encodeURIComponent(companyId)}`,
  );

  const notFound = error instanceof ApiRequestError && error.status === 404;

  if (notFound) {
    return (
      <>
        <Topbar title="Company not found" onMenu={openSidebar} />
        <main className="p-6">
          <Card className="mx-auto max-w-lg p-8 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No company with id “{companyId}”</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have been renamed in the source workbook. Try the company explorer.
            </p>
            <Button asChild className="mt-5">
              <Link href="/companies">Browse companies</Link>
            </Button>
          </Card>
        </main>
      </>
    );
  }

  const company = data?.company;
  const kpis = data?.kpis;

  return (
    <>
      <Topbar
        title={company?.name ?? "Company drill-down"}
        subtitle={company ? `${company.sector}${company.cin ? ` · CIN ${company.cin}` : ""}` : "Loading…"}
        onMenu={openSidebar}
        onRefresh={refetch}
        isRefreshing={isValidating}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
                Dashboard
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(`/api/export?companies=${encodeURIComponent(companyId)}`, `${companyId}-csr-projects.csv`)
              }
            >
              Export
            </Button>
          </>
        }
      />

      <main className="flex flex-col gap-5 p-4 md:p-6">
        {error && !notFound ? (
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error.message}
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(
            [
              { label: "Total CSR Spend", value: formatCrore(kpis?.totalSpend), sub: `${formatNumber(kpis?.projectCount ?? 0)} projects` },
              {
                label: "National Rank",
                value: kpis?.nationalRank ? `#${kpis.nationalRank}` : "—",
                sub: `${formatShare(kpis?.nationalShare ?? 0)} of all CSR spend`,
              },
              {
                label: "YoY Growth",
                value: formatSignedPercent(kpis?.yoyGrowthPct ?? null),
                sub: "Latest vs. previous FY",
              },
              {
                label: "Obligation Utilisation",
                value: formatPercent(kpis?.utilisationPct ?? null),
                sub: kpis?.obligation
                  ? `Latest FY spend vs. ${formatCrore(kpis.obligation)} obligation`
                  : "Obligation not disclosed",
              },
            ] as const
          ).map((card) => (
            <Card key={card.label} className="p-5">
              <p className="kpi-label">{card.label}</p>
              {isLoading ? (
                <Skeleton className="mt-3 h-7 w-24" />
              ) : (
                <p className="kpi-value mt-3">{card.value}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{card.sub}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <ChartCard
            title="Spending Trend"
            description="Amount spent vs. outlay by financial year"
            className="xl:col-span-2"
            height={300}
            isLoading={isLoading}
            error={error && !notFound ? error : null}
            isEmpty={!data?.trend.length}
          >
            <YearTrendChart data={data?.trend ?? []} />
          </ChartCard>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>Disclosed contacts and source documents</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  <ProfileRow icon={Building2} label="Sector" value={company?.sector ?? "—"} />
                  <ProfileRow
                    icon={Target}
                    label="Avg net profit"
                    value={company?.averageNetProfit ? formatCrore(company.averageNetProfit) : "Not disclosed"}
                  />
                  <ProfileRow icon={Mail} label="CSR contact" value={company?.contactName ?? "Not disclosed"} />
                  {company?.contactEmail ? (
                    <ProfileRow icon={Mail} label="Email" value={company.contactEmail} />
                  ) : null}
                  {company?.contactPhone ? (
                    <ProfileRow icon={Phone} label="Phone" value={company.contactPhone.replace("tel:", "")} />
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {REPORT_LINKS.map(({ key, label }) => {
                      const href = company?.[key];
                      if (typeof href !== "string" || !href.startsWith("http")) return null;
                      return (
                        <a
                          key={key}
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <FileText className="size-3" />
                          {label}
                          <ExternalLink className="size-3" />
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ChartCard
            title="Thematic Mix"
            description="Spend by CSR category"
            height={320}
            isLoading={isLoading}
            error={error && !notFound ? error : null}
            isEmpty={!data?.byTheme.length}
          >
            <RankList data={data?.byTheme ?? []} limit={10} />
          </ChartCard>

          <ChartCard
            title="State Coverage"
            description={`${kpis?.stateCount ?? 0} locations reached`}
            height={320}
            isLoading={isLoading}
            error={error && !notFound ? error : null}
            isEmpty={!data?.byState.length}
          >
            <RankList data={data?.byState ?? []} limit={10} />
          </ChartCard>

          <ChartCard
            title="Sector Peers"
            description="Largest CSR spenders in the same sector"
            height={320}
            isLoading={isLoading}
            error={error && !notFound ? error : null}
            isEmpty={!data?.peers.length}
          >
            <div className="h-full space-y-1.5 overflow-y-auto pr-1">
              {(data?.peers ?? []).map((peer, index) => (
                <Link
                  key={peer.id ?? peer.name}
                  href={`/companies/${encodeURIComponent(peer.id ?? "")}`}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-accent/60 ${
                    peer.id === companyId ? "bg-accent/60 font-semibold" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 text-[11px] text-muted-foreground">{index + 1}</span>
                    <span className="truncate">{peer.name}</span>
                  </span>
                  <span className="numeric shrink-0">{formatCrore(peer.value)}</span>
                </Link>
              ))}
            </div>
          </ChartCard>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Largest Projects</CardTitle>
              <CardDescription>Top 25 disclosed projects by amount spent</CardDescription>
            </div>
            <Badge variant="outline">{formatNumber(kpis?.projectCount ?? 0)} total</Badge>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="border-t border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>FY</TableHead>
                    <TableHead className="min-w-64">Project</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Outlay</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.topProjects.length ? (
                    data.topProjects.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="numeric whitespace-nowrap text-xs text-muted-foreground">
                          {row.year}
                        </TableCell>
                        <TableCell className="text-[13px]" title={row.project ?? undefined}>
                          {truncate(row.project, 90)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">{truncate(row.theme, 24)}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {row.state}
                          </span>
                        </TableCell>
                        <TableCell className="numeric text-right text-[13px] text-muted-foreground">
                          {formatCrore(row.outlay)}
                        </TableCell>
                        <TableCell className="numeric text-right text-[13px] font-semibold">
                          {formatCrore(row.spent)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                        No projects disclosed for this company.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-[13px] font-medium">{value}</span>
    </div>
  );
}
