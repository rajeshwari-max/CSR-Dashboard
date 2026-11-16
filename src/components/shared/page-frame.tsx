"use client";

import * as React from "react";
import { AlertTriangle, Database } from "lucide-react";
import Link from "next/link";

import { useShell } from "@/components/shell/app-shell";
import { FilterBar } from "@/components/shell/filter-bar";
import { Topbar } from "@/components/shell/topbar";
import { ApiRequestError } from "@/lib/api";
import { ANNEXURE_SOURCE, DATA_SOURCE, UNITS_NOTE } from "@/lib/data-source";
import { formatDateTime } from "@/lib/format";
import type { ListKey } from "@/store/filters";
import type { Filters, Meta } from "@/types";

interface PageFrameProps {
  title: string;
  subtitle?: string;
  meta: Meta | null;
  metaLoading: boolean;
  filters: Filters;
  filterQuery: string;
  resultCount?: number;
  hideFacets?: ListKey[];
  showFilters?: boolean;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  error?: Error | null;
  children: React.ReactNode;
}

const PAGE_GUIDANCE: Record<string, string> = {
  "Company Analysis": "See which companies fund CSR, compare peers, and open a company profile to understand its projects and locations.",
  "State Analysis": "Compare where CSR projects were reported. Use the state and district views to identify geographic concentration and gaps.",
  "Sector Analysis": "Compare CSR spending by the reporting companies' BRSR industry sector. A sector describes the funder, not the project's development theme.",
  "Implementation Analysis": "See whether projects were delivered directly or through agencies, and which named partners appear in company annexures.",
  "Policy Insights": "Compare this dataset with national CSR totals and examine ownership, aspirational districts, unspent amounts and partners. Use the source notes before comparing figures from different filings.",
  "Indicator Explorer": "Choose one CSR measure, then compare places or sectors on a map, sized boxes, a correlation chart or a custom table. Larger values show more activity, not necessarily better outcomes.",
  "Trend Analysis": "Follow CSR spending across financial years and compare changes. Check the selected years before interpreting growth or projections.",
  "Reports": "Download a report for the current filter selection. Review the selected years and companies before sharing it.",
  "AI Insights": "Explore patterns and ask questions about the selected CSR data. Check important answers against the linked charts and filings.",
  "Data Explorer": "Inspect the underlying project records and their source fields. Use filters to verify a chart or find a specific filing.",
  "Project Analytics": "Review one project's reported amount, location and theme, then use its source details to check the filing.",
  "Data Upload": "Add new CSR data to the dashboard after checking the columns and source. Review the preview before importing records.",
};

/** One visual and filter shell for every analytical page. */
export function PageFrame({
  title,
  subtitle,
  meta,
  filters,
  resultCount,
  hideFacets,
  showFilters = true,
  actions,
  onRefresh,
  isRefreshing,
  error,
  children,
}: PageFrameProps) {
  const { openMobileNav, openPalette } = useShell();
  const datasetMissing = error instanceof ApiRequestError && error.status === 503;

  return (
    <>
      <Topbar
        onMenu={openMobileNav}
        onOpenPalette={openPalette}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        datasetLabel={meta ? formatDateTime(meta.generatedAt) : undefined}
      />
      {showFilters ? (
        <FilterBar meta={meta} filters={filters} hide={hideFacets} resultCount={resultCount} />
      ) : null}

      <main className="content">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="page-head-actions">{actions}</div> : null}
        </div>
        {PAGE_GUIDANCE[title] ? (
          <p className="mb-5 rounded-lg border px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground" style={{ background: "var(--surface)" }}>
            <strong style={{ color: "var(--text)" }}>How to use this page: </strong>{PAGE_GUIDANCE[title]}
          </p>
        ) : null}

        {datasetMissing ? (
          <div className="card empty-state">
            <Database width={28} height={28} />
            <h3>No dataset loaded</h3>
            <p>Upload a CSV or Excel file to populate the dashboard.</p>
            <Link href="/data-upload" className="btn btn-gradient btn-sm">
              Go to Data Upload
            </Link>
          </div>
        ) : (
          <>
            {error ? (
              <div className="card error-banner">
                <AlertTriangle width={15} height={15} />
                <span>
                  {error.message}
                  {error instanceof ApiRequestError && error.detail ? ` — ${error.detail}` : ""}
                </span>
              </div>
            ) : null}
            {children}
          </>
        )}
      </main>

      <footer className="footer">
        <span>
          CMS CSR Intelligence · {meta ? `${meta.rowCount.toLocaleString("en-IN")} projects` : "loading…"} · Source:{" "}
          <a href={DATA_SOURCE.url} target="_blank" rel="noreferrer noopener" title={DATA_SOURCE.long} style={{ textDecoration: "underline" }}>
            {DATA_SOURCE.short}
          </a>{" "}
          and{" "}
          <a href={ANNEXURE_SOURCE.url} target="_blank" rel="noreferrer noopener" title={ANNEXURE_SOURCE.long} style={{ textDecoration: "underline" }}>
            {ANNEXURE_SOURCE.short}
          </a>{" "}
          · {UNITS_NOTE}
        </span>
        <span>Dataset built {meta ? formatDateTime(meta.generatedAt) : "—"}</span>
      </footer>
    </>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mini-label">{children}</div>;
}
