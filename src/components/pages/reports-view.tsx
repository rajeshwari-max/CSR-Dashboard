"use client";

import * as React from "react";
import { CheckCircle2, Download, Loader2, Trash2 } from "lucide-react";

import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { REPORT_FORMATS, type ReportFormat } from "@/components/shared/export-menu";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadFile, useApi } from "@/lib/api";
import { formatCrore, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SummaryResponse } from "@/types";

interface SavedReport {
  id: string;
  format: ReportFormat;
  scope: string;
  query: string;
  at: string;
}

const STORAGE_KEY = "cms.reports.history";

const CONTENTS: Record<ReportFormat, string[]> = {
  pdf: [
    "Cover with the exact filter scope",
    "10 KPIs + executive summary",
    "Year-wise trend table",
    "Bar charts: companies, states, sectors, categories",
    "Analysis cards, anomalies, data-quality notes",
  ],
  xlsx: [
    "Summary sheet with KPIs and caveats",
    "Trend sheet with YoY growth",
    "Companies / States / Sectors / Categories / Implementation / Districts",
    "Anomalies sheet (z-scores)",
    "Full filtered project register with autofilter",
  ],
  pptx: [
    "Title slide with scope and date",
    "KPI slide (6 cards)",
    "Trend chart + per-year detail",
    "Four ranked bar-chart slides",
    "Findings and recommendations slides",
  ],
  csv: ["One row per CSR project", "12 columns incl. CIN and aspirational flag", "UTF-8 with BOM for Excel"],
};

export function ReportsView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const meta = useMeta();
  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);

  const [busy, setBusy] = React.useState<ReportFormat | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<SavedReport[]>([]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw) as SavedReport[]);
    } catch {
      /* corrupt or unavailable storage — start empty */
    }
  }, []);

  const persist = (next: SavedReport[]) => {
    setHistory(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
    } catch {
      /* storage full or blocked */
    }
  };

  const generate = async (format: ReportFormat) => {
    setBusy(format);
    setError(null);
    try {
      await downloadFile(
        `/api/report/${format}?${filterQuery}`,
        `csr-report-${new Date().toISOString().slice(0, 10)}.${format}`,
      );
      persist([
        { id: `${Date.now()}`, format, scope: scope || "All data", query: filterQuery, at: new Date().toISOString() },
        ...history,
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report generation failed");
    } finally {
      setBusy(null);
    }
  };

  const kpis = summary.data?.kpis;

  return (
    <PageFrame
      title="Reports"
      subtitle={`Everything below is generated from the current filter selection · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => summary.refetch()}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>What will be included</SectionLabel>
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-5 lg:grid-cols-5">
          <Figure label="Scope" value={scope || "All data"} wide />
          <Figure label="Projects" value={formatNumber(summary.data?.filteredRows ?? 0)} />
          <Figure label="Total spend" value={formatCrore(kpis?.totalSpend ?? 0)} />
          <Figure label="Companies" value={formatNumber(kpis?.companyCount ?? 0)} />
          <Figure label="Years" value={meta.data?.years.join(", ") ?? "—"} />
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>
      ) : null}

      <SectionLabel>Download reports</SectionLabel>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {REPORT_FORMATS.map((format) => {
          const Icon = format.icon;
          const isBusy = busy === format.key;
          return (
            <Card key={format.key} className="flex flex-col">
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    {format.label}
                  </CardTitle>
                  <CardDescription>{format.hint}</CardDescription>
                </div>
                <Badge variant="outline" className="uppercase">
                  {format.key}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <ul className="space-y-1.5">
                  {CONTENTS[format.key].map((line) => (
                    <li key={line} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" />
                      {line}
                    </li>
                  ))}
                </ul>
                <Button onClick={() => void generate(format.key)} disabled={busy !== null} className="w-full">
                  {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {isBusy ? "Generating…" : "Generate & download"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionLabel>Saved reports</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent downloads</CardTitle>
            <CardDescription>Stored in this browser · re-run to regenerate with fresh data</CardDescription>
          </div>
          {history.length ? (
            <Button variant="ghost" size="xs" onClick={() => persist([])}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No reports generated yet in this browser.
            </p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    <span className="uppercase">{item.format}</span> · {item.scope}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(item.at)}</p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    void downloadFile(
                      `/api/report/${item.format}?${item.query}`,
                      `csr-report-${item.at.slice(0, 10)}.${item.format}`,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  Re-download
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

    </PageFrame>
  );
}

function Figure({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <p className="kpi-label">{label}</p>
      <p className="mt-1.5 truncate text-[15px] font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}
