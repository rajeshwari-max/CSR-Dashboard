"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCrore, formatNumber, formatShare, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NamedValue } from "@/types";

type Column = "value" | "share" | "count" | "companies" | "latest" | "yoy" | "unspent";

interface BreakdownTableProps {
  rows: NamedValue[];
  label: string;
  columns?: Column[];
  limit?: number;
  onSelect?: (name: string) => void;
  selected?: string[];
  /** Renders an inline proportional bar behind the name cell. */
  showBars?: boolean;
  latestLabel?: string;
  /**
   * Adds a total row summed over every row (not only the ones shown), so the
   * project tally reconciles with the headline figures and with other tables.
   */
  showTotal?: boolean;
  /** Replace the default column names for this table only. */
  headers?: Partial<Record<Column, string>>;
  /** Adds a last column with this link text (e.g. "View Profile"); clicking it calls onSelect. */
  actionLabel?: string;
}

const HEADERS: Record<Column, string> = {
  value: "Total CSR Expenditure",
  // Each row's share of the table's own total. For companies, sectors, states
  // (incl. Pan India) and Schedule VII areas every project has a value, so this
  // equals the share of total CSR spent. Tables where it does not (a single
  // company, aspirational districts) pass their own header; the district table
  // drops the column because most spending has no district.
  share: "Share of Total CSR Spent",
  count: "Projects Reported",
  companies: "Companies",
  latest: "Latest Year",
  yoy: "Year-on-Year Change",
  unspent: "Unspent CSR",
};

export function BreakdownTable({
  rows,
  label,
  columns = ["value", "share", "count", "companies", "yoy"],
  limit = 25,
  onSelect,
  selected = [],
  showBars = true,
  latestLabel,
  showTotal = false,
  headers,
  actionLabel,
}: BreakdownTableProps) {
  const [sortColumn, setSortColumn] = React.useState<Column>("value");
  const [ascending, setAscending] = React.useState(false);

  const sorted = React.useMemo(() => {
    const pick = (row: NamedValue): number => {
      switch (sortColumn) {
        case "share": return row.share ?? 0;
        case "count": return row.count ?? 0;
        case "companies": return row.companies ?? 0;
        case "latest": return row.latest ?? 0;
        case "yoy": return row.yoyGrowthPct ?? Number.NEGATIVE_INFINITY;
        case "unspent": return row.unspent ?? Number.NEGATIVE_INFINITY;
        default: return row.value;
      }
    };
    return [...rows].sort((a, b) => (pick(a) - pick(b)) * (ascending ? 1 : -1)).slice(0, limit);
  }, [rows, sortColumn, ascending, limit]);

  const peak = sorted.reduce((max, row) => Math.max(max, row.value), 0) || 1;

  const toggle = (column: Column) => {
    if (column === sortColumn) setAscending((value) => !value);
    else {
      setSortColumn(column);
      setAscending(false);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-12 normal-case">Rank</TableHead>
          <TableHead className="min-w-52 normal-case">{label}</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="h-auto whitespace-normal py-2 text-right leading-tight">
              <button
                type="button"
                onClick={() => toggle(column)}
                title="Click to sort"
                className={cn(
                  "inline-block max-w-[9.5rem] text-right hover:text-foreground",
                  sortColumn === column && "font-semibold text-foreground",
                )}
              >
                {headers?.[column] ?? (column === "latest" ? (latestLabel ?? HEADERS[column]) : HEADERS[column])}
              </button>
            </TableHead>
          ))}
          {actionLabel ? <TableHead className="text-right normal-case">Action</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length + 2 + (actionLabel ? 1 : 0)} className="py-12 text-center text-sm text-muted-foreground">
              Nothing matches the current filters.
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((row, index) => {
            const active = selected.includes(row.name);
            return (
              <TableRow
                key={row.id ?? row.name}
                className={cn(onSelect && "cursor-pointer", active && "bg-accent/50")}
                onClick={() => onSelect?.(row.name)}
              >
                <TableCell className="numeric text-[11px] text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="relative">
                  {showBars ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 -z-0 rounded-r"
                      style={{ width: `${Math.max(2, (row.value / peak) * 100)}%`, background: "color-mix(in srgb, var(--c1) 12%, transparent)" }}
                    />
                  ) : null}
                  <span className="relative z-10 line-clamp-1 text-[13px] font-medium">{row.name}</span>
                </TableCell>
                {columns.map((column) => {
                  if (column === "yoy") {
                    const growth = row.yoyGrowthPct;
                    return (
                      <TableCell key={column} className="text-right">
                        {growth === null || growth === undefined ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Badge variant={growth >= 0 ? "success" : "danger"} className="numeric">
                            {formatSignedPercent(growth)}
                          </Badge>
                        )}
                      </TableCell>
                    );
                  }
                  if (column === "unspent") {
                    return (
                      <TableCell key={column} className="numeric whitespace-nowrap text-right text-[13px]">
                        {row.unspent === null || row.unspent === undefined ? (
                          <span className="text-xs text-muted-foreground" title="No CSR report available for this company">—</span>
                        ) : (
                          formatCrore(row.unspent)
                        )}
                      </TableCell>
                    );
                  }
                  const value =
                    column === "value" ? formatCrore(row.value)
                    : column === "share" ? formatShare(row.share)
                    : column === "count" ? formatNumber(row.count ?? 0)
                    : column === "companies" ? formatNumber(row.companies ?? 0)
                    : formatCrore(row.latest ?? 0);
                  return (
                    <TableCell key={column} className="numeric whitespace-nowrap text-right text-[13px]">
                      {value}
                    </TableCell>
                  );
                })}
                {actionLabel ? (
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[12.5px] font-semibold" style={{ color: "var(--c1)" }}>
                      {actionLabel}
                      <ChevronRight className="size-3.5" />
                    </span>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })
        )}
        {showTotal && rows.length ? (
          <TableRow className="border-t-2 bg-muted/40 font-semibold hover:bg-muted/40">
            <TableCell />
            <TableCell className="text-[13px]">
              Total
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                {rows.length > sorted.length
                  ? `(all ${formatNumber(rows.length)} rows; ${formatNumber(sorted.length)} shown)`
                  : `(${formatNumber(rows.length)} rows)`}
              </span>
            </TableCell>
            {columns.map((column) => {
              const sum = (pick: (row: NamedValue) => number) => rows.reduce((total, row) => total + pick(row), 0);
              const value =
                column === "value" ? formatCrore(sum((row) => row.value))
                : column === "share" ? "100%"
                : column === "count" ? formatNumber(sum((row) => row.count ?? 0))
                : column === "latest" ? formatCrore(sum((row) => row.latest ?? 0))
                : column === "unspent" ? formatCrore(sum((row) => row.unspent ?? 0))
                : ""; // companies and YoY do not add up across rows
              return (
                <TableCell key={column} className="numeric whitespace-nowrap text-right text-[13px]">
                  {value}
                </TableCell>
              );
            })}
            {actionLabel ? <TableCell /> : null}
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
