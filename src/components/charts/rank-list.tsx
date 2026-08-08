"use client";

import { formatCrore, formatShare } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NamedValue } from "@/types";

interface RankListProps {
  data: NamedValue[];
  limit?: number;
  onSelect?: (name: string) => void;
  emptyMessage?: string;
}

/** The "rank-row" pattern from the CMS mockup: label, inline bar, value. */
export function RankList({ data, limit = 10, onSelect, emptyMessage = "Nothing to rank." }: RankListProps) {
  const rows = data.slice(0, limit);
  const max = rows.reduce((peak, row) => Math.max(peak, row.value), 0) || 1;

  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ol className="h-full space-y-2 overflow-y-auto pr-1">
      {rows.map((row, index) => (
        <li key={row.name}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(row.name)}
            className={cn(
              "w-full rounded-lg px-2 py-1.5 text-left transition-colors",
              onSelect ? "hover:bg-accent/60" : "cursor-default",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 text-[11px] font-semibold text-muted-foreground">{index + 1}</span>
                <span className="truncate text-[13px] font-medium">{row.name}</span>
              </span>
              <span className="numeric shrink-0 text-[13px] font-semibold">{formatCrore(row.value)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-6">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/80"
                  style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
                />
              </span>
              <span className="numeric w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                {formatShare(row.share)} · {row.count ?? 0} proj
              </span>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}
