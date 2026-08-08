"use client";

import { create } from "zustand";

import { EMPTY_FILTERS, type Filters } from "@/types";

export type ListKey = "years" | "sectors" | "states" | "districts" | "themes" | "companies" | "modes";

interface FilterStore extends Filters {
  setValues: (key: ListKey, values: string[]) => void;
  toggleValue: (key: ListKey, value: string) => void;
  setSearch: (search: string) => void;
  setRange: (min: number | null, max: number | null) => void;
  setAspirationalOnly: (value: boolean) => void;
  /** Apply a partial filter set (chart click-through, insight "investigate"). */
  apply: (patch: Partial<Filters>) => void;
  hydrate: (filters: Partial<Filters>) => void;
  clearKey: (key: ListKey) => void;
  clearAll: () => void;
}

/** Typed single-facet patch — avoids casting computed keys. */
function patch(key: ListKey, values: string[]): Partial<Filters> {
  const next: Partial<Filters> = {};
  next[key] = values;
  return next;
}

export const useFilterStore = create<FilterStore>((set) => ({
  ...EMPTY_FILTERS,
  setValues: (key, values) => set(patch(key, values)),
  toggleValue: (key, value) =>
    set((state) => {
      const current = state[key];
      return patch(
        key,
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      );
    }),
  setSearch: (search) => set({ search }),
  setRange: (minSpend, maxSpend) => set({ minSpend, maxSpend }),
  setAspirationalOnly: (aspirationalOnly) => set({ aspirationalOnly }),
  apply: (nextPatch) => set((state) => ({ ...state, ...nextPatch })),
  hydrate: (filters) => set((state) => ({ ...state, ...filters })),
  clearKey: (key) => set(patch(key, [])),
  clearAll: () => set({ ...EMPTY_FILTERS }),
}));

/**
 * Plain filter object (no actions). Always wrap in `useShallow` at the call
 * site — this builds a new object each call and zustand v5 compares by
 * reference, which would otherwise re-render forever.
 */
export function selectFilters(state: FilterStore): Filters {
  return {
    years: state.years,
    sectors: state.sectors,
    states: state.states,
    districts: state.districts,
    themes: state.themes,
    companies: state.companies,
    modes: state.modes,
    search: state.search,
    minSpend: state.minSpend,
    maxSpend: state.maxSpend,
    aspirationalOnly: state.aspirationalOnly,
  };
}
