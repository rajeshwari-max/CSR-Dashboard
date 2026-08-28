"use client";

import * as React from "react";
import { AlertTriangle, Database } from "lucide-react";
import Link from "next/link";

import { useShell } from "@/components/shell/app-shell";
import { FilterBar } from "@/components/shell/filter-bar";
import { Topbar } from "@/components/shell/topbar";
import { ApiRequestError } from "@/lib/api";
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
          CMS CSR Intelligence · {meta ? `${meta.rowCount.toLocaleString("en-IN")} projects` : "loading…"} · all
          amounts INR Crore
        </span>
        <span>Dataset built {meta ? formatDateTime(meta.generatedAt) : "—"}</span>
      </footer>
    </>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mini-label">{children}</div>;
}
