"use client";

import * as React from "react";
import { ChevronDown, Filter, RotateCcw, Search, Target, X } from "lucide-react";

import { activeFilterCount } from "@/lib/query";
import { useFilterStore, type ListKey } from "@/store/filters";
import type { Filters, Meta } from "@/types";

/**
 * The draft's sticky chip filter bar. Each chip opens a searchable multi-select
 * popover; chips the dataset cannot support are rendered disabled with the
 * reason, rather than dropped (which would change the drafted layout).
 */

interface ChipSpec {
  key: ListKey;
  label: string;
  options: (meta: Meta) => string[];
  /** Company chip stores ids but shows names. */
  valueLabel?: (meta: Meta, value: string) => string;
  optionValue?: (meta: Meta) => { value: string; label: string; hint?: string }[];
}

const CHIPS: ChipSpec[] = [
  { key: "years", label: "Year", options: (meta) => meta.years },
  { key: "sectors", label: "Sector", options: (meta) => meta.sectors },
  {
    key: "companies",
    label: "Company",
    options: (meta) => meta.companies.map((company) => company.id),
    optionValue: (meta) =>
      meta.companies.map((company) => ({ value: company.id, label: company.name, hint: company.sector })),
    valueLabel: (meta, value) => meta.companies.find((company) => company.id === value)?.name ?? value,
  },
  { key: "themes", label: "Domain", options: (meta) => meta.themes },
  { key: "modes", label: "Implementation", options: (meta) => meta.modes },
];

/**
 * CSR-amount bands, in INR crore, applied to the per-project "amount spent"
 * column. `max: null` is the open-ended top band. Bands are half-open
 * [min, max) so a ₹5 Cr project lands in "₹5–10 Cr" and never in two bands.
 */
const AMOUNT_BANDS: { label: string; min: number; max: number | null }[] = [
  { label: "0 – 1 Cr", min: 0, max: 1 },
  { label: "1 – 5 Cr", min: 1, max: 5 },
  { label: "5 – 10 Cr", min: 5, max: 10 },
  { label: "More than 10 Cr", min: 10, max: null },
];

function activeBand(filters: Filters) {
  return AMOUNT_BANDS.find(
    (band) => band.min === filters.minSpend && (band.max ?? null) === filters.maxSpend,
  );
}

export function FilterBar({
  meta,
  filters,
  hide = [],
  resultCount,
}: {
  meta: Meta | null;
  filters: Filters;
  hide?: ListKey[];
  resultCount?: number;
}) {
  const [openChip, setOpenChip] = React.useState<string | null>(null);
  const setValues = useFilterStore((state) => state.setValues);
  const setSearch = useFilterStore((state) => state.setSearch);
  const setRange = useFilterStore((state) => state.setRange);
  const setAspirationalOnly = useFilterStore((state) => state.setAspirationalOnly);
  const clearAll = useFilterStore((state) => state.clearAll);
  const barRef = React.useRef<HTMLDivElement>(null);
  const [term, setTerm] = React.useState(filters.search);

  React.useEffect(() => setTerm(filters.search), [filters.search]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (term !== filters.search) setSearch(term);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search, setSearch, term]);

  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenChip(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const count = activeFilterCount(filters);

  return (
    <div className="filterbar" ref={barRef}>
      <span className="fb-label">
        <Filter width={12} height={12} />
        Filters
      </span>

      {!hide.includes("states") && !hide.includes("districts") ? (
        <div className="pos-rel">
          <button
            type="button"
            className={`select-chip${filters.states.length || filters.districts.length ? " active" : ""}`}
            onClick={() => setOpenChip(openChip === "location" ? null : "location")}
            disabled={!meta}
          >
            <span className="truncate1" style={{ maxWidth: 180 }}>
              {filters.districts[0] ?? filters.states[0] ?? "State & District"}
            </span>
            <ChevronDown width={12} height={12} />
          </button>
          {openChip === "location" && meta ? (
            <LocationPopover
              meta={meta}
              state={filters.states[0] ?? null}
              district={filters.districts[0] ?? null}
              onState={(state) => {
                setValues("states", state ? [state] : []);
                setValues("districts", []);
              }}
              onDistrict={(district) => {
                setValues("districts", district ? [district] : []);
                setOpenChip(null);
              }}
              onClose={() => setOpenChip(null)}
            />
          ) : null}
        </div>
      ) : null}

      {CHIPS.filter((chip) => !hide.includes(chip.key) && (!meta || chip.options(meta).length > 0)).map((chip) => {
        const selected = filters[chip.key];
        const options =
          meta && chip.optionValue
            ? chip.optionValue(meta)
            : (meta ? chip.options(meta) : []).map((value) => ({ value, label: value }));
        const summary =
          selected.length === 0
            ? chip.label
            : selected.length === 1
              ? (meta && chip.valueLabel ? chip.valueLabel(meta, selected[0]) : selected[0])
              : `${chip.label} · ${selected.length}`;

        return (
          <div key={chip.key} className="pos-rel">
            <button
              type="button"
              className={`select-chip${selected.length ? " active" : ""}`}
              onClick={() => setOpenChip(openChip === chip.key ? null : chip.key)}
              disabled={!meta}
              data-tip={chip.key === "themes" ? "Schedule VII Category" : undefined}
            >
              <span className="truncate1" style={{ maxWidth: 160 }}>
                {summary}
              </span>
              <ChevronDown width={12} height={12} />
            </button>
            {openChip === chip.key ? (
              <ChipPopover
                options={options}
                selected={selected}
                onChange={(values) => setValues(chip.key, values)}
                onClose={() => setOpenChip(null)}
              />
            ) : null}
          </div>
        );
      })}

      <div className="pos-rel">
        <button
          type="button"
          className={`select-chip${filters.minSpend !== null || filters.maxSpend !== null ? " active" : ""}`}
          onClick={() => setOpenChip(openChip === "amount" ? null : "amount")}
        >
          <span className="truncate1" style={{ maxWidth: 150 }}>
            {activeBand(filters)?.label ?? "CSR Amount"}
          </span>
          <ChevronDown width={12} height={12} />
        </button>
        {openChip === "amount" ? (
          <div
            className="dropdown open"
            style={{ top: 34, left: 0, right: "auto", width: 220, padding: 8 }}
          >
            <div className="mini-label no-rule" style={{ margin: "2px 4px 8px" }}>
              Amount spent per project (₹ Cr)
            </div>
            {AMOUNT_BANDS.map((band) => {
              const active =
                filters.minSpend === band.min && filters.maxSpend === (band.max ?? null);
              return (
                <button
                  key={band.label}
                  type="button"
                  className="cmdk-result"
                  style={{
                    width: "100%",
                    border: "none",
                    background: active ? "var(--blue-light)" : "transparent",
                    fontWeight: active ? 600 : 500,
                  }}
                  onClick={() => {
                    // Clicking the live band clears it, so the chip toggles.
                    if (active) setRange(null, null);
                    else setRange(band.min, band.max);
                    setOpenChip(null);
                  }}
                >
                  <span style={{ fontSize: 12.5 }}>{band.label}</span>
                  {active ? <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span> : null}
                </button>
              );
            })}
            <div className="cmdk-foot">
              <button
                type="button"
                className="fb-text"
                onClick={() => {
                  setRange(null, null);
                  setOpenChip(null);
                }}
                disabled={filters.minSpend === null && filters.maxSpend === null}
              >
                Any amount
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <label className="filter-search">
        <Search width={13} height={13} />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search companies, projects, states, districts…"
          aria-label="Search across companies, projects, states, districts and domains"
        />
      </label>

      {(meta?.stats.aspirational_rows ?? 0) > 0 ? (
        <div className="pos-rel">
          <button
            type="button"
            className={`select-chip${filters.aspirationalOnly ? " active" : ""}`}
            onClick={() => setOpenChip(openChip === "aspirational" ? null : "aspirational")}
          >
            <Target width={12} height={12} />
            Aspirational districts
            <ChevronDown width={12} height={12} />
          </button>
          {openChip === "aspirational" ? (
            <AspirationalPopover
              options={meta?.aspirationalDistricts ?? []}
              selected={filters.districts}
              allActive={filters.aspirationalOnly && filters.districts.length === 0}
              onAll={() => {
                setValues("districts", []);
                setAspirationalOnly(true);
                setOpenChip(null);
              }}
              onSelect={(district) => {
                setValues("districts", [district]);
                setAspirationalOnly(true);
                setOpenChip(null);
              }}
              onClear={() => {
                setAspirationalOnly(false);
                setOpenChip(null);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="spacer" />

      {resultCount !== undefined ? (
        <span className="filter-count">{resultCount.toLocaleString("en-IN")} projects</span>
      ) : null}

      <button type="button" className="fb-text" onClick={clearAll} disabled={count === 0}>
        <RotateCcw width={13} height={13} />
        Reset{count ? ` (${count})` : ""}
      </button>
    </div>
  );
}

function LocationPopover({
  meta,
  state,
  district,
  onState,
  onDistrict,
  onClose,
}: {
  meta: Meta;
  state: string | null;
  district: string | null;
  onState: (state: string | null) => void;
  onDistrict: (district: string | null) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = React.useState("");
  const options = state ? (meta.districtsByState[state] ?? []) : meta.states;
  const filtered = options.filter((option) => option.toLowerCase().includes(term.trim().toLowerCase()));

  return (
    <div className="dropdown open" style={{ top: 34, left: 0, right: "auto", width: 300 }}>
      <div className="cmdk-input-row" style={{ padding: "9px 12px" }}>
        {state ? (
          <button type="button" className="fb-text" onClick={() => { onState(null); setTerm(""); }}>
            ← States
          </button>
        ) : null}
        <input
          autoFocus
          value={term}
          placeholder={state ? `Search districts in ${state}…` : "Search states…"}
          onChange={(event) => setTerm(event.target.value)}
          style={{ fontSize: 12.5 }}
        />
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto", padding: 6 }}>
        {!state ? (
          <button
            type="button"
            className="cmdk-result"
            style={{ width: "100%", border: "none" }}
            onClick={() => { onState(null); onDistrict(null); onClose(); }}
          >
            <strong>All India</strong>
          </button>
        ) : (
          <button
            type="button"
            className="cmdk-result"
            style={{ width: "100%", border: "none", background: !district ? "var(--blue-light)" : "transparent" }}
            onClick={() => { onDistrict(null); onClose(); }}
          >
            <strong>All districts in {state}</strong>
          </button>
        )}
        {filtered.map((option) => {
          const active = state ? district === option : false;
          return (
            <button
              key={option}
              type="button"
              className="cmdk-result"
              style={{ width: "100%", border: "none", background: active ? "var(--blue-light)" : "transparent" }}
              onClick={() => {
                if (state) onDistrict(option);
                else { onState(option); setTerm(""); }
              }}
            >
              <span>{option}</span>
              {!state ? <span style={{ marginLeft: "auto" }}>›</span> : null}
            </button>
          );
        })}
        {filtered.length === 0 ? <div className="empty-state"><p>No matches</p></div> : null}
      </div>
      <div className="cmdk-foot">
        <span>{state ? `${filtered.length} districts` : `${filtered.length} states`}</span>
        <button type="button" className="fb-text" style={{ marginLeft: "auto" }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function ChipPopover({
  options,
  selected,
  onChange,
  onClose,
}: {
  options: { value: string; label: string; hint?: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = React.useState("");
  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    const source = needle
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) || option.hint?.toLowerCase().includes(needle),
        )
      : options;
    return source.slice(0, 300);
  }, [options, term]);

  return (
    <div className="dropdown open" style={{ top: 34, left: 0, right: "auto", width: 280 }}>
      <div className="cmdk-input-row" style={{ padding: "9px 12px" }}>
        <input
          autoFocus
          value={term}
          placeholder="Search…"
          onChange={(event) => setTerm(event.target.value)}
          style={{ fontSize: 12.5 }}
        />
        {selected.length ? (
          <button type="button" className="icon-btn" onClick={() => onChange([])} aria-label="Clear">
            <X width={14} height={14} />
          </button>
        ) : null}
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", padding: 6 }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 18 }}>
            <p>No matches</p>
          </div>
        ) : (
          filtered.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className="cmdk-result"
                style={{ width: "100%", border: "none", background: active ? "var(--blue-light)" : "transparent" }}
                onClick={() =>
                  onChange(
                    active ? selected.filter((item) => item !== option.value) : [...selected, option.value],
                  )
                }
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: active ? "var(--accent)" : "var(--surface)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 9,
                    flexShrink: 0,
                  }}
                >
                  {active ? "✓" : ""}
                </span>
                <span className="truncate1" style={{ fontSize: 12.5 }}>
                  {option.label}
                </span>
                {option.hint ? <span className="meta" style={{ marginLeft: "auto" }}>{option.hint}</span> : null}
              </button>
            );
          })
        )}
      </div>
      <div className="cmdk-foot">
        <button
          type="button"
          className="fb-text"
          onClick={() => onChange(filtered.map((option) => option.value))}
          disabled={filtered.length === 0}
        >
          Select all{term.trim() ? " shown" : ""}
        </button>
        <button type="button" className="fb-text" onClick={() => onChange([])} disabled={selected.length === 0}>
          Clear all
        </button>
        <span style={{ marginLeft: "auto" }}>{selected.length} selected</span>
        <button type="button" className="fb-text" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function AspirationalPopover({
  options,
  selected,
  allActive,
  onAll,
  onSelect,
  onClear,
}: {
  options: string[];
  selected: string[];
  allActive: boolean;
  onAll: () => void;
  onSelect: (district: string) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = React.useState("");
  const filtered = options.filter((name) => name.toLowerCase().includes(term.trim().toLowerCase()));

  return (
    <div className="dropdown open" style={{ top: 34, left: 0, right: "auto", width: 300 }}>
      <div className="cmdk-input-row" style={{ padding: "9px 12px" }}>
        <input
          autoFocus
          value={term}
          placeholder="Search aspirational districts…"
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      <div style={{ maxHeight: 280, overflowY: "auto", padding: 6 }}>
        <button
          type="button"
          className="cmdk-result"
          style={{ width: "100%", border: "none", background: allActive ? "var(--blue-light)" : "transparent" }}
          onClick={onAll}
        >
          <strong>All aspirational districts</strong>
        </button>
        {filtered.map((district) => (
          <button
            key={district}
            type="button"
            className="cmdk-result"
            style={{ width: "100%", border: "none", background: selected.includes(district) ? "var(--blue-light)" : "transparent" }}
            onClick={() => onSelect(district)}
          >
            {district}
          </button>
        ))}
        {filtered.length === 0 ? <div className="empty-state"><p>No matching district</p></div> : null}
      </div>
      <div className="cmdk-foot">
        <span>{options.length} named districts</span>
        <button type="button" className="fb-text" style={{ marginLeft: "auto" }} onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
