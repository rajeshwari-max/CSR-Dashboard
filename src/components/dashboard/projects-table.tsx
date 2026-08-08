"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCrore, formatNumber, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectsResponse, SortDirection, SortField } from "@/types";

interface ProjectsTableProps {
  data: ProjectsResponse | null;
  isLoading: boolean;
  error: Error | null;
  sort: SortField;
  direction: SortDirection;
  page: number;
  pageSize: number;
  onSortChange: (sort: SortField) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const COLUMNS: { key: SortField | "project" | "mode"; label: string; sortable: boolean; className?: string }[] = [
  { key: "company", label: "Company", sortable: true, className: "min-w-52" },
  { key: "year", label: "FY", sortable: true },
  { key: "project", label: "CSR Project", sortable: false, className: "min-w-64" },
  { key: "theme", label: "Category", sortable: true },
  { key: "sector", label: "Sector", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "outlay", label: "Outlay", sortable: true, className: "text-right" },
  { key: "spent", label: "Spent", sortable: true, className: "text-right" },
];

export function ProjectsTable({
  data,
  isLoading,
  error,
  sort,
  direction,
  page,
  pageSize,
  onSortChange,
  onPageChange,
  onPageSizeChange,
}: ProjectsTableProps) {
  const pageCount = data?.pageCount ?? 1;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card id="projects" className="scroll-mt-24">
      <CardHeader>
        <div>
          <CardTitle>Project Register</CardTitle>
          <CardDescription>
            Every disclosed CSR project in the current view. Click a company to drill down.
          </CardDescription>
        </div>
        {data ? (
          <Badge variant="outline" className="shrink-0">
            {formatCrore(data.totalSpendInView)} in view
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {error ? (
          <div className="flex flex-col items-center gap-2 px-5 py-16 text-center text-sm text-destructive">
            <AlertTriangle className="size-5" />
            <p className="font-medium">Could not load projects</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        ) : (
          <>
            <div className="border-t border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent">
                    {COLUMNS.map((column) => {
                      const isActive = column.sortable && sort === column.key;
                      const Icon = !column.sortable
                        ? null
                        : isActive
                          ? direction === "asc"
                            ? ArrowUp
                            : ArrowDown
                          : ArrowUpDown;
                      return (
                        <TableHead key={column.key} className={column.className}>
                          {column.sortable ? (
                            <button
                              type="button"
                              onClick={() => onSortChange(column.key as SortField)}
                              className={cn(
                                "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                                isActive && "text-foreground",
                                column.className?.includes("text-right") && "flex-row-reverse",
                              )}
                            >
                              {column.label}
                              {Icon ? <Icon className="size-3" /> : null}
                            </button>
                          ) : (
                            column.label
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isLoading ? (
                    Array.from({ length: Math.min(pageSize, 10) }).map((_, index) => (
                      <TableRow key={index}>
                        {COLUMNS.map((column) => (
                          <TableCell key={column.key}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data && data.rows.length ? (
                    data.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/companies/${encodeURIComponent(row.companyId)}`}
                            className="group inline-flex items-center gap-1 hover:text-primary"
                          >
                            <span className="line-clamp-1">{row.company}</span>
                            <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap text-xs text-muted-foreground">
                          {row.year}
                        </TableCell>
                        <TableCell className="text-[13px]" title={row.project ?? undefined}>
                          {truncate(row.project, 80)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted" className="whitespace-nowrap">
                            {truncate(row.theme, 26)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.sector}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.state}
                          {row.district ? (
                            <span className="block text-[11px] opacity-70">{row.district}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap text-right text-[13px] text-muted-foreground">
                          {formatCrore(row.outlay)}
                        </TableCell>
                        <TableCell className="numeric whitespace-nowrap text-right text-[13px] font-semibold">
                          {formatCrore(row.spent)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={COLUMNS.length} className="py-16 text-center text-sm text-muted-foreground">
                        No projects match the current filters. Try clearing a filter or widening the search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Showing <span className="numeric font-medium text-foreground">{formatNumber(from)}</span>–
                <span className="numeric font-medium text-foreground">{formatNumber(to)}</span> of{" "}
                <span className="numeric font-medium text-foreground">{formatNumber(total)}</span>
              </p>

              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page <= 1 || isLoading}
                  onClick={() => onPageChange(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="numeric min-w-20 text-center text-xs text-muted-foreground">
                  {page} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page >= pageCount || isLoading}
                  onClick={() => onPageChange(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
