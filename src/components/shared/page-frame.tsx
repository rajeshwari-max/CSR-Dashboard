"use client";

import * as React from "react";
import { AlertTriangle, Database } from "lucide-react";

import { FilterBar } from "@/components/dashboard/filter-bar";
import { useSidebar } from "@/components/layout/app-shell";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ApiRequestError } from "@/lib/api";
import type { Filters, Meta } from "@/types";

interface PageFrameProps {
  title: string;
  subtitle?: string;
  meta: Meta | null;
  metaLoading: boolean;
  filters: Filters;
  filterQuery: string;
  resultCount?: number;
  hideFacets?: React.ComponentProps<typeof FilterBar>["hide"];
  /** Set false on pages that operate on their own controls (e.g. Reports). */
  showFilters?: boolean;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  error?: Error | null;
  children: React.ReactNode;
}

/** Shared chrome: topbar, filter bar, dataset-missing screen, error banner. */
export function PageFrame({
  title,
  subtitle,
  meta,
  metaLoading,
  filters,
  filterQuery,
  resultCount,
  hideFacets,
  showFilters = true,
  actions,
  onRefresh,
  isRefreshing,
  error,
  children,
}: PageFrameProps) {
  const { openSidebar } = useSidebar();
  const datasetMissing = error instanceof ApiRequestError && error.status === 503;

  if (datasetMissing) {
    return (
      <>
        <Topbar title={title} onMenu={openSidebar} />
        <main className="p-6">
          <Card className="mx-auto max-w-xl p-8 text-center">
            <Database className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Dataset not built yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Put your workbook(s) in <code className="rounded bg-muted px-1">data/raw/</code> and run{" "}
              <code className="rounded bg-muted px-1">npm run etl</code> to generate{" "}
              <code className="rounded bg-muted px-1">data/dataset.json</code>, then reload.
            </p>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={title}
        subtitle={subtitle}
        onMenu={openSidebar}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        actions={actions}
      />
      <main className="flex flex-col gap-5 p-4 md:p-6">
        {showFilters ? (
          <FilterBar
            meta={meta}
            isLoading={metaLoading}
            filters={filters}
            filterQuery={filterQuery}
            resultCount={resultCount}
            hide={hideFacets}
          />
        ) : null}

        {error && !datasetMissing ? (
          <Card className="flex items-center gap-3 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {error.message}
              {error instanceof ApiRequestError && error.detail ? ` — ${error.detail}` : ""}
            </span>
          </Card>
        ) : null}

        {children}
      </main>
    </>
  );
}

/** Consistent section heading between panel groups. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </h2>
  );
}
