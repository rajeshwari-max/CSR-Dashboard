"use client";

import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import type { NamedValue } from "@/types";

/** The draft's rank-row pattern: index chip, name + bar, right-aligned value. */
export function RankRows({
  rows,
  limit = 5,
  onSelect,
  showAvatar = false,
  valueMode = "crore",
  metaMode = "projects",
}: {
  rows: NamedValue[];
  limit?: number;
  onSelect?: (row: NamedValue) => void;
  showAvatar?: boolean;
  valueMode?: "crore" | "share";
  metaMode?: "projects" | "companies" | "share";
}) {
  const list = rows.slice(0, limit);
  const peak = list.reduce((max, row) => Math.max(max, row.value), 0) || 1;

  if (!list.length) {
    return (
      <div className="empty-state">
        <h4>Nothing to rank</h4>
        <p>No records match the current filters.</p>
      </div>
    );
  }

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter((word) => /[A-Za-z]/.test(word))
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("");

  return (
    <>
      {list.map((row, index) => (
        <div
          className="rank-row"
          key={row.id ?? row.name}
          onClick={() => onSelect?.(row)}
          role={onSelect ? "button" : undefined}
        >
          {showAvatar ? (
            <span className="avatar">{initials(row.name)}</span>
          ) : (
            <span className="rank-num">{index + 1}</span>
          )}
          <div className="rank-main">
            <div className="rank-name truncate1">{row.name}</div>
            <div className="rank-meta">
              {metaMode === "projects"
                ? `${formatNumber(row.count ?? 0)} projects`
                : metaMode === "companies"
                  ? `${formatNumber(row.companies ?? 0)} companies`
                  : formatShare(row.share)}
            </div>
            <div className="rank-bar-track">
              <div className="rank-bar-fill" style={{ width: `${Math.max(3, (row.value / peak) * 100)}%` }} />
            </div>
          </div>
          <div className="rank-value">
            {valueMode === "crore" ? formatCrore(row.value) : formatShare(row.share)}
          </div>
        </div>
      ))}
    </>
  );
}
