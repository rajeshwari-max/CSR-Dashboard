"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";

import { useApi } from "@/lib/api";
import { describeFilters, filtersToParams, paramsToFilters } from "@/lib/query";
import { selectFilters, useFilterStore } from "@/store/filters";
import type { Meta } from "@/types";

/**
 * One place for the filter lifecycle every page shares:
 *   URL -> store on first paint, store -> URL on change, and a memoised query
 *   string for the data hooks.
 *
 * Both directions are guarded: `router.replace` re-renders the caller, so an
 * unguarded write would spin, and `selectFilters` builds a fresh object, so it
 * must go through `useShallow`.
 */
export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useFilterStore(useShallow(selectFilters));
  const hydrate = useFilterStore((state) => state.hydrate);

  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    hydrate(paramsToFilters(new URLSearchParams(searchParams.toString())));
  }, [hydrate, searchParams]);

  const filterQuery = React.useMemo(() => filtersToParams(filters).toString(), [filters]);

  const lastPushed = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!hydrated.current) return;
    if (lastPushed.current === filterQuery) return;
    lastPushed.current = filterQuery;
    router.replace(filterQuery ? `${pathname}?${filterQuery}` : pathname, { scroll: false });
  }, [filterQuery, pathname, router]);

  const scope = React.useMemo(() => describeFilters(filters), [filters]);

  return { filters, filterQuery, scope, pathname };
}

/** Meta is small, immutable per build and needed by every page — fetch it once. */
export function useMeta() {
  return useApi<Meta>("/api/meta");
}
