"use client";

import * as React from "react";
import { AlertTriangle, Database } from "lucide-react";
import Link from "next/link";

import { FilterBar } from "@/components/shell/filter-bar";
import { Topbar } from "@/components/shell/topbar";
import { useShell } from "@/components/shell/app-shell";
import { ApiRequestError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Filters, Meta } from "@/types";

interface PageFrameProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  meta: Meta | null;
  filters: Filters;
  showFilters?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  error?: Error | null;
  children: React.ReactNode;
}

/** Draft page chrome: topbar, sticky filter bar, page-head, content, footer. */
export function PageFrame({
  title,
  subtitle,
  actions,
  meta,
  filters,
  showFilters = true,
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
      {showFilters ? <FilterBar meta={meta} filters={filters} /> : null}

      <main className="content">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="page-head-actions">{actions}</div> : null}
        </div>

        {datasetMissing ? (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <Database className="icon" width={26} height={26} style={{ color: "var(--text-soft)" }} />
            <h3 style={{ marginTop: 12, fontSize: 15 }}>No dataset loaded</h3>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Upload a CSV or Excel file to populate the dashboard.
            </p>
            <Link href="/data-upload" className="btn btn-gradient btn-sm" style={{ marginTop: 14 }}>
              Go to Data Upload
            </Link>
          </div>
        ) : (
          <>
            {error ? (
              <div
                className="card"
                style={{ borderColor: "var(--danger)", background: "var(--danger-bg)", marginBottom: 18 }}
              >
                <div className="row gap-8" style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600 }}>
                  <AlertTriangle width={15} height={15} />
                  {error.message}
                  {error instanceof ApiRequestError && error.detail ? ` — ${error.detail}` : ""}
                </div>
              </div>
            ) : null}
            {children}
          </>
        )}
      </main>

      <footer className="footer">
        <span>
          CMS CSR Intelligence · {meta ? `${meta.rowCount.toLocaleString("en-IN")} projects` : "loading…"} ·
          all amounts INR Crore
        </span>
        <span>Dataset built {meta ? formatDateTime(meta.generatedAt) : "—"}</span>
      </footer>
    </>
  );
}

/** Draft's section divider label. */
export function MiniLabel({ children }: { children: React.ReactNode }) {
  return <div className="mini-label">{children}</div>;
}
