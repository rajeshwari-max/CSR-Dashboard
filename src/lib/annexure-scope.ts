import type { Filters } from "@/types";

/** Annual company financials cannot be allocated to individual projects or places. */
export function canScopeAnnexureFinancials(filters: Filters): boolean {
  return !(
    filters.states.length || filters.districts.length || filters.themes.length ||
    filters.modes.length || filters.search.trim() || filters.aspirationalOnly ||
    filters.minSpend !== null || filters.maxSpend !== null
  );
}
