"use client";

import * as React from "react";

import { ProjectsTable } from "@/components/dashboard/projects-table";
import { SectionLabel } from "@/components/shared/page-frame";
import { useApi } from "@/lib/api";
import type { ProjectsResponse, SortDirection, SortField } from "@/types";

export function ProjectRegisterSection({ filterQuery }: { filterQuery: string }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
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
      <SectionLabel>Projects in this view</SectionLabel>
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
