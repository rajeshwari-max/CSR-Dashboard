"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCrore, formatNumber, formatShare, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NamedValue } from "@/types";

type Column = "value" | "share" | "count" | "companies" | "latest" | "yoy";

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
}

const HEADERS: Record<Column, string> = {
  value: "Spend",
  // Shares are computed within the dimension: only 44.7% of spend carries a
  // district, so a district's share is of district-attributed spend, not of
  // the grand total. Naming it "Share of shown" keeps that honest.
  share: "Share of shown",
  count: "Projects",
  companies: "Companies",
  latest: "Latest FY",
  yoy: "YoY",
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
          <TableHead className="w-8">#</TableHead>
          <TableHead className="min-w-52">{label}</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="text-right">
              <button
                type="button"
                onClick={() => toggle(column)}
                className={cn(
                  "inline-flex flex-row-reverse items-center gap-1 hover:text-foreground",
                  sortColumn === column && "text-foreground",
                )}
              >
                {column === "latest" ? (latestLabel ?? HEADERS[column]) : HEADERS[column]}
                {sortColumn === column ? (
                  ascending ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                ) : null}
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length + 2} className="py-12 text-center text-sm text-muted-foreground">
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
                      className="absolute inset-y-1 left-0 -z-0 rounded-r bg-primary/10"
                      style={{ width: `${Math.max(2, (row.value / peak) * 100)}%` }}
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
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
