"use client";

import * as React from "react";

import { ProjectsTable } from "@/components/dashboard/projects-table";
import { SectionLabel } from "@/components/shared/page-frame";
import { Badge } from "@/components/ui/badge";
import { useApi } from "@/lib/api";
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

  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      {description ? <p className="-mt-2 text-xs text-muted-foreground">{description}</p> : null}


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
