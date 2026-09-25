"use client";

import * as React from "react";

import { ProjectsTable } from "@/components/dashboard/projects-table";
import { SectionLabel } from "@/components/shared/page-frame";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import type { ProjectsResponse, SortDirection, SortField } from "@/types";

/**
 * The project register embedded inside an analysis tab.
 *
 * Every analysis page shares one filter store, so this needs nothing but the
 * page's current `filterQuery`: clicking a state on the map, a sector in the
 * pie, or a company in the list narrows the register underneath automatically.
 * Paging and sorting are local, so two embeds never fight over one another.
 *
 * `scopeSpend` is the spend total the host page already computed for the same
 * filters. When supplied, the panel shows what share of that total the register
 * accounts for — on a page filtered to one state that is 100%, and the number
 * is there to make the link between the charts above and the rows below
 * explicit rather than implied.
 */
export function ProjectRegisterSection({
  filterQuery,
  label = "Projects in this view",
  description,
  scopeSpend,
  defaultPageSize = 25,
}: {
  filterQuery: string;
  label?: string;
  description?: string;
  scopeSpend?: number;
  defaultPageSize?: number;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);
  const [sort, setSort] = React.useState<SortField>("spent");
  const [direction, setDirection] = React.useState<SortDirection>("desc");

  React.useEffect(() => setPage(1), [filterQuery, pageSize, sort, direction]);

  const projects = useApi<ProjectsResponse>(
    `/api/projects?${filterQuery}&page=${page}&pageSize=${pageSize}&sort=${sort}&direction=${direction}`,
  );

  const handleSort = (field: SortField) => {
    if (field === sort) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDirection(field === "spent" || field === "outlay" ? "desc" : "asc");
    }
  };

  const total = projects.data?.total ?? 0;
  const spend = projects.data?.totalSpendInView ?? 0;
  // Mean over the whole filtered set, not just the page on screen. Rows with no
  // disclosed amount are still counted as projects, so this is spend per
  // recorded project, not spend per project that disclosed a figure.
  const average = total > 0 ? spend / total : 0;

  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      {description ? <p className="-mt-2 text-xs text-muted-foreground">{description}</p> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat label="Projects" value={formatNumber(total)} />
        <MiniStat label="Amount spent in view" value={formatCrore(spend)} />
        <MiniStat label="Average project" value={formatCrore(average)} />
        <MiniStat
          label="Share of scope"
          value={
            scopeSpend && scopeSpend > 0 ? formatShare(spend / scopeSpend) : formatNumber(pageSize)
          }
          hint={scopeSpend && scopeSpend > 0 ? "of amount spent shown above" : "rows per page"}
        />
      </div>

      <ProjectsTable
        data={projects.data}
        isLoading={projects.isLoading}
        error={projects.error}
        sort={sort}
        direction={direction}
        page={page}
        pageSize={pageSize}
        onSortChange={handleSort}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value mt-2 text-xl">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

/** Inline badge describing the active CSR-amount band, when one is applied. */
export function AmountBandBadge({
  minSpend,
  maxSpend,
}: {
  minSpend: number | null;
  maxSpend: number | null;
}) {
  if (minSpend === null && maxSpend === null) return null;
  return (
    <Badge variant="default">
      {minSpend ?? 0} – {maxSpend ?? "∞"} Cr per project
    </Badge>
  );
}
