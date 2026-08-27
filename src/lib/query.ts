/** Filter <-> URLSearchParams conversion shared by client fetchers and route handlers. */

import { EMPTY_FILTERS, type Filters, type SortDirection, type SortField } from "@/types";

export const LIST_KEYS = ["years", "sectors", "states", "districts", "themes", "companies", "modes"] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export function filtersToParams(filters: Filters, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const values = filters[key];
    if (values.length) params.set(key, values.join("|"));
  }
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.minSpend !== null) params.set("minSpend", String(filters.minSpend));
  if (filters.maxSpend !== null) params.set("maxSpend", String(filters.maxSpend));
  if (filters.aspirationalOnly) params.set("aspirational", "1");
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params;
}

export function paramsToFilters(params: URLSearchParams): Filters {
  const read = (key: ListKey) => {
    const raw = params.get(key);
    if (!raw) return [];
    return raw
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 500); // hard cap: a hand-crafted URL can't blow up the scan
  };

  const number = (key: string) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  };

  return {
    ...EMPTY_FILTERS,
    years: read("years"),
    sectors: read("sectors"),
    states: read("states"),
    districts: read("districts"),
    themes: read("themes"),
    companies: read("companies"),
    modes: read("modes"),
    search: (params.get("search") ?? "").slice(0, 120),
    minSpend: number("minSpend"),
    maxSpend: number("maxSpend"),
    aspirationalOnly: params.get("aspirational") === "1",
  };
}

const SORT_FIELDS: SortField[] = [
  "company", "year", "spent", "outlay", "sector", "state", "district", "theme", "mode",
];

export function parseSort(params: URLSearchParams): { sort: SortField; direction: SortDirection } {
  const sort = params.get("sort") as SortField | null;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  return { sort: sort && SORT_FIELDS.includes(sort) ? sort : "spent", direction };
}

export function parsePagination(params: URLSearchParams) {
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(params.get("pageSize") ?? "25", 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 25,
  };
}

export function activeFilterCount(filters: Filters): number {
  return (
    LIST_KEYS.reduce((total, key) => total + filters[key].length, 0) +
    (filters.search.trim() ? 1 : 0) +
    (filters.minSpend !== null || filters.maxSpend !== null ? 1 : 0) +
    (filters.aspirationalOnly ? 1 : 0)
  );
}

/** Human-readable scope line, reused by page subtitles and report headers. */
export function describeFilters(filters: Filters): string {
  const parts: string[] = [];
  if (filters.years.length) parts.push(filters.years.join(", "));
  else parts.push("All years");
  if (filters.companies.length) parts.push(`${filters.companies.length} companies`);
  if (filters.sectors.length) parts.push(filters.sectors.join(", "));
  if (filters.states.length) parts.push(filters.states.join(", "));
  if (filters.districts.length) parts.push(`${filters.districts.length} districts`);
  if (filters.themes.length) parts.push(filters.themes.join(", "));
  if (filters.modes.length) parts.push(filters.modes.join(", "));
  if (filters.aspirationalOnly) parts.push("aspirational districts");
  if (filters.search.trim()) parts.push(`"${filters.search.trim()}"`);
  return parts.join(" · ");
}
