"use client";

import * as React from "react";
import { FilterX, Info, Search, SlidersHorizontal, Target } from "lucide-react";

import { ExportMenu } from "@/components/shared/export-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { activeFilterCount } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/store/filters";
import type { Filters, Meta } from "@/types";

type FacetKey = "years" | "companies" | "states" | "districts" | "sectors" | "themes" | "modes";

interface FilterBarProps {
  meta: Meta | null;
  isLoading: boolean;
  filters: Filters;
  filterQuery: string;
  resultCount?: number;
  /** Facets that are redundant on a given page. */
  hide?: FacetKey[];
}

/**
 * Facets the mockup shows which the workbook cannot back. Rendered disabled
 * with the reason rather than silently dropped, so the gap between "designed"
 * and "available" stays visible instead of turning into invented data.
 */
const UNAVAILABLE_FACETS = [
  { label: "Quarter", reason: "CSR disclosures are annual — the workbook has no quarter column." },
  { label: "Month", reason: "CSR disclosures are annual — the workbook has no month or date column." },
  { label: "NGO", reason: "No implementing-agency name column in the source data." },
  { label: "Status", reason: "No project status column in the source data." },
];

export function FilterBar({
  meta,
  isLoading,
  filters,
  filterQuery,
  resultCount,
  hide = [],
}: FilterBarProps) {
  const setValues = useFilterStore((state) => state.setValues);
  const setSearch = useFilterStore((state) => state.setSearch);
  const setRange = useFilterStore((state) => state.setRange);
  const setAspirationalOnly = useFilterStore((state) => state.setAspirationalOnly);
  const clearAll = useFilterStore((state) => state.clearAll);

  // Local mirror keeps typing responsive; pushed to the store on a debounce.
  const [term, setTerm] = React.useState(filters.search);
  React.useEffect(() => setTerm(filters.search), [filters.search]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (term !== filters.search) setSearch(term);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const [minText, setMinText] = React.useState(filters.minSpend?.toString() ?? "");
  const [maxText, setMaxText] = React.useState(filters.maxSpend?.toString() ?? "");
  React.useEffect(() => {
    setMinText(filters.minSpend?.toString() ?? "");
    setMaxText(filters.maxSpend?.toString() ?? "");
  }, [filters.minSpend, filters.maxSpend]);

  const count = activeFilterCount(filters);

  if (isLoading || !meta) {
    return (
      <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </Card>
    );
  }

  const toOptions = (values: string[]) => values.map((value) => ({ value, label: value }));
  const shows = (key: FacetKey) => !hide.includes(key);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="size-3.5" />
          Filters
        </span>
        {UNAVAILABLE_FACETS.map((facet) => (
          <Popover key={facet.label}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
              >
                {facet.label}
                <Info className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">{facet.label} filter unavailable</p>
              {facet.reason}
            </PopoverContent>
          </Popover>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {shows("years") ? (
          <MultiSelect
            label="Financial Year"
            options={toOptions(meta.years)}
            selected={filters.years}
            onChange={(values) => setValues("years", values)}
            placeholder="All years"
          />
        ) : null}
        {shows("companies") ? (
          <MultiSelect
            label="Company"
            options={meta.companies.map((company) => ({
              value: company.id,
              label: company.name,
              hint: company.sector,
            }))}
            selected={filters.companies}
            onChange={(values) => setValues("companies", values)}
            placeholder={`All ${meta.companies.length}`}
            searchPlaceholder="Search companies…"
          />
        ) : null}
        {shows("states") ? (
          <MultiSelect
            label="State"
            options={toOptions(meta.states)}
            selected={filters.states}
            onChange={(values) => setValues("states", values)}
            placeholder="All states"
          />
        ) : null}
        {shows("districts") ? (
          <MultiSelect
            label="District"
            options={toOptions(meta.districts)}
            selected={filters.districts}
            onChange={(values) => setValues("districts", values)}
            placeholder={`All ${meta.districts.length}`}
            searchPlaceholder="Search districts…"
          />
        ) : null}
        {shows("sectors") ? (
          <MultiSelect
            label="Sector"
            options={toOptions(meta.sectors)}
            selected={filters.sectors}
            onChange={(values) => setValues("sectors", values)}
            placeholder="All sectors"
          />
        ) : null}
        {shows("themes") ? (
          <MultiSelect
            label="Schedule VII Category"
            options={toOptions(meta.themes)}
            selected={filters.themes}
            onChange={(values) => setValues("themes", values)}
            placeholder="All categories"
          />
        ) : null}
        {shows("modes") ? (
          <MultiSelect
            label="Implementation"
            options={toOptions(meta.modes)}
            selected={filters.modes}
            onChange={(values) => setValues("modes", values)}
            placeholder="All modes"
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search project, company, state, district…"
            aria-label="Search projects"
            className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">CSR amount</span>
          <input
            value={minText}
            inputMode="decimal"
            onChange={(event) => setMinText(event.target.value)}
            onBlur={() => setRange(minText === "" ? null : Number(minText), filters.maxSpend)}
            placeholder="min"
            aria-label="Minimum project spend in crore"
            className="numeric h-9 w-16 rounded-lg border border-input bg-card px-2 text-center text-xs shadow-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-muted-foreground">–</span>
          <input
            value={maxText}
            inputMode="decimal"
            onChange={(event) => setMaxText(event.target.value)}
            onBlur={() => setRange(filters.minSpend, maxText === "" ? null : Number(maxText))}
            placeholder="max"
            aria-label="Maximum project spend in crore"
            className="numeric h-9 w-16 rounded-lg border border-input bg-card px-2 text-center text-xs shadow-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-[11px] text-muted-foreground">Cr</span>
        </div>

        <button
          type="button"
          onClick={() => setAspirationalOnly(!filters.aspirationalOnly)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors",
            filters.aspirationalOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-muted-foreground hover:bg-accent",
          )}
        >
          <Target className="size-3.5" />
          Aspirational districts
        </button>

        {resultCount !== undefined ? (
          <Badge variant="muted" className="h-7 px-3">
            {resultCount.toLocaleString("en-IN")} projects
          </Badge>
        ) : null}

        <Button variant="ghost" size="sm" onClick={clearAll} disabled={count === 0}>
          <FilterX className="size-4" />
          Reset{count > 0 ? ` (${count})` : ""}
        </Button>

        <ExportMenu filterQuery={filterQuery} />
      </div>
    </Card>
  );
}
