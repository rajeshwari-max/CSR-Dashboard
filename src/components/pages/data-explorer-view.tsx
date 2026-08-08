"use client";

import * as React from "react";
import { Bookmark, BookmarkPlus, Columns3, Trash2 } from "lucide-react";

import { ExportMenu } from "@/components/shared/export-menu";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, truncate } from "@/lib/format";
import { paramsToFilters } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/store/filters";
import type { ProjectRow, ProjectsResponse, SortDirection, SortField } from "@/types";

type ColumnKey = keyof Pick<
  ProjectRow,
  "company" | "year" | "project" | "theme" | "sector" | "state" | "district" | "mode" | "outlay" | "spent" | "aspirational"
>;

const COLUMNS: { key: ColumnKey; label: string; sortable?: SortField; align?: "right" }[] = [
  { key: "company", label: "Company", sortable: "company" },
  { key: "year", label: "FY", sortable: "year" },
  { key: "project", label: "CSR Project" },
  { key: "theme", label: "Category", sortable: "theme" },
  { key: "sector", label: "Sector", sortable: "sector" },
  { key: "state", label: "State", sortable: "state" },
  { key: "district", label: "District", sortable: "district" },
  { key: "mode", label: "Implementation", sortable: "mode" },
  { key: "aspirational", label: "Aspirational" },
  { key: "outlay", label: "Outlay", sortable: "outlay", align: "right" },
  { key: "spent", label: "Spent", sortable: "spent", align: "right" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["company", "year", "project", "theme", "state", "spent"];
const VIEWS_KEY = "cms.explorer.views";
const COLUMNS_KEY = "cms.explorer.columns";

interface SavedView {
  id: string;
  name: string;
  query: string;
  at: string;
}

export function DataExplorerView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const hydrate = useFilterStore((state) => state.hydrate);
  const meta = useMeta();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [sort, setSort] = React.useState<SortField>("spent");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  const [visible, setVisible] = React.useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [views, setViews] = React.useState<SavedView[]>([]);
  const [viewName, setViewName] = React.useState("");

  React.useEffect(() => setPage(1), [filterQuery, pageSize, sort, direction]);

  React.useEffect(() => {
    try {
      const savedViews = window.localStorage.getItem(VIEWS_KEY);
      if (savedViews) setViews(JSON.parse(savedViews) as SavedView[]);
      const savedColumns = window.localStorage.getItem(COLUMNS_KEY);
      if (savedColumns) setVisible(JSON.parse(savedColumns) as ColumnKey[]);
    } catch {
      /* ignore unreadable storage */
    }
  }, []);

  const persistColumns = (next: ColumnKey[]) => {
    setVisible(next);
    try {
      window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const persistViews = (next: SavedView[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next.slice(0, 20)));
    } catch {
      /* ignore */
    }
  };

  const projects = useApi<ProjectsResponse>(
    `/api/projects?${filterQuery}&page=${page}&pageSize=${pageSize}&sort=${sort}&direction=${direction}`,
  );

  const columns = COLUMNS.filter((column) => visible.includes(column.key));

  const handleSort = (field?: SortField) => {
    if (!field) return;
    if (field === sort) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDirection(field === "spent" || field === "outlay" ? "desc" : "asc");
    }
  };

  const cellValue = (row: ProjectRow, key: ColumnKey): React.ReactNode => {
    switch (key) {
      case "spent":
      case "outlay":
        return <span className="numeric">{formatCrore(row[key])}</span>;
      case "aspirational":
        return row.aspirational ? <Badge variant="success">Yes</Badge> : <span className="text-muted-foreground">—</span>;
      case "project":
        return <span title={row.project ?? undefined}>{truncate(row.project, 70)}</span>;
      default:
        return row[key] ?? "—";
    }
  };

  return (
    <PageFrame
      title="Data Explorer"
      subtitle={`Raw project register · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={projects.data?.total}
      error={projects.error ?? meta.error}
      onRefresh={() => projects.refetch()}
      isRefreshing={projects.isValidating}
    >
      <SectionLabel>Saved views &amp; bookmarks</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Saved views</CardTitle>
            <CardDescription>Filter sets stored in this browser · restoring one rewrites the URL</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="Name this view…"
              aria-label="Saved view name"
              className="h-8 w-44 rounded-lg border border-input bg-card px-2.5 text-xs shadow-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!viewName.trim()}
              onClick={() => {
                persistViews([
                  {
                    id: `${Date.now()}`,
                    name: viewName.trim(),
                    query: filterQuery,
                    at: new Date().toISOString(),
                  },
                  ...views,
                ]);
                setViewName("");
              }}
            >
              <BookmarkPlus className="size-4" />
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {views.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No saved views yet. Set some filters, name them and hit save.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {views.map((view) => (
                <span
                  key={view.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 hover:text-primary"
                    onClick={() => hydrate(paramsToFilters(new URLSearchParams(view.query)))}
                  >
                    <Bookmark className="size-3" />
                    {view.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    onClick={() => persistViews(views.filter((item) => item.id !== view.id))}
                  >
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SectionLabel>Explore</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Project register</CardTitle>
            <CardDescription>
              {formatNumber(projects.data?.total ?? 0)} rows · {formatCrore(projects.data?.totalSpendInView ?? 0)} in
              view
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 className="size-4" />
                  Columns ({visible.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                {COLUMNS.map((column) => {
                  const checked = visible.includes(column.key);
                  return (
                    <button
                      key={column.key}
                      type="button"
                      onClick={() =>
                        persistColumns(
                          checked
                            ? visible.filter((key) => key !== column.key)
                            : [...COLUMNS.map((c) => c.key).filter((key) => visible.includes(key) || key === column.key)],
                        )
                      }
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "grid size-4 place-items-center rounded border border-input text-[10px]",
                          checked && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      {column.label}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
            <ExportMenu filterQuery={filterQuery} label="Export" />
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="border-t border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow className="hover:bg-transparent">
                  {columns.map((column) => (
                    <TableHead key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column.sortable)}
                          className={cn("hover:text-foreground", sort === column.sortable && "text-foreground")}
                        >
                          {column.label}
                          {sort === column.sortable ? (direction === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      ) : (
                        column.label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.isLoading ? (
                  Array.from({ length: 12 }).map((_, index) => (
                    <TableRow key={index}>
                      {columns.map((column) => (
                        <TableCell key={column.key}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : projects.data?.rows.length ? (
                  projects.data.rows.map((row) => (
                    <TableRow key={row.id}>
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={cn("text-[13px]", column.align === "right" && "text-right")}
                        >
                          {cellValue(row, column.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="py-16 text-center text-sm text-muted-foreground">
                      No rows match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Page {projects.data?.page ?? 1} of {projects.data?.pageCount ?? 1}
            </p>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={(projects.data?.page ?? 1) <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(projects.data?.page ?? 1) >= (projects.data?.pageCount ?? 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
