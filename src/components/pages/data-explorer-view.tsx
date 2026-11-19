"use client";

import * as React from "react";
import { Columns3 } from "lucide-react";

import { ExportMenu } from "@/components/shared/export-menu";
import { PageFrame } from "@/components/shared/page-frame";
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
import { cn } from "@/lib/utils";
import type { ProjectRow, ProjectsResponse, SortDirection, SortField } from "@/types";

type ColumnKey = keyof Pick<
  ProjectRow,
  "company" | "year" | "project" | "theme" | "sector" | "state" | "district" | "mode" | "outlay" | "spent" | "aspirational"
>;

const COLUMNS: { key: ColumnKey; label: string; sortable?: SortField; align?: "right" }[] = [
  { key: "company", label: "Company Name", sortable: "company" },
  { key: "year", label: "Financial Year", sortable: "year" },
  { key: "project", label: "Project Description" },
  { key: "theme", label: "Schedule VII Thematic Area", sortable: "theme" },
  { key: "sector", label: "Company Industry Sector", sortable: "sector" },
  { key: "state", label: "Project Location (State)", sortable: "state" },
  { key: "district", label: "Project Location (District)", sortable: "district" },
  { key: "mode", label: "Implementing Agency", sortable: "mode" },
  { key: "aspirational", label: "Aspirational District" },
  { key: "outlay", label: "Approved Outlay", sortable: "outlay", align: "right" },
  { key: "spent", label: "Amount Spent", sortable: "spent", align: "right" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["company", "year", "project", "theme", "sector", "state", "spent"];
// v2: column labels and defaults changed, so older saved column choices are ignored.
const COLUMNS_KEY = "cms.explorer.columns.v2";

export function DataExplorerView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const meta = useMeta();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [sort, setSort] = React.useState<SortField>("spent");
  const [direction, setDirection] = React.useState<SortDirection>("desc");
  const [visible, setVisible] = React.useState<ColumnKey[]>(DEFAULT_COLUMNS);

  React.useEffect(() => setPage(1), [filterQuery, pageSize, sort, direction]);

  React.useEffect(() => {
    try {
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
      title="CSR Data"
      subtitle={`Every reported CSR project: company, year, Schedule VII area, location and amount · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={projects.data?.total}
      error={projects.error ?? meta.error}
      onRefresh={() => projects.refetch()}
      isRefreshing={projects.isValidating}
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle>CSR Data</CardTitle>
            <CardDescription>
              {formatNumber(projects.data?.total ?? 0)} projects · {formatCrore(projects.data?.totalSpendInView ?? 0)} total CSR
              spent (selected filters). Click a column name to sort.
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
                          className={cn("hover:text-foreground", sort === column.sortable && "font-semibold text-foreground")}
                        >
                          {column.label}
                        </button>
                      ) : (
                        <span className="normal-case">{column.label}</span>
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
