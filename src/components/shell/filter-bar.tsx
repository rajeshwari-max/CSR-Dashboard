"use client";

import * as React from "react";
import { ChevronDown, Filter, RotateCcw, Save, X } from "lucide-react";

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
  { key: "states", label: "State", options: (meta) => meta.states },
  { key: "districts", label: "District", options: (meta) => meta.districts },
  { key: "sectors", label: "Sector", options: (meta) => meta.sectors },
  {
    key: "companies",
    label: "Company",
    options: (meta) => meta.companies.map((company) => company.id),
    optionValue: (meta) =>
      meta.companies.map((company) => ({ value: company.id, label: company.name, hint: company.sector })),
    valueLabel: (meta, value) => meta.companies.find((company) => company.id === value)?.name ?? value,
  },
  { key: "themes", label: "Schedule VII Category", options: (meta) => meta.themes },
  { key: "modes", label: "Implementation", options: (meta) => meta.modes },
];

const DISABLED_CHIPS = [
  { label: "Quarter", reason: "CSR disclosures are annual — no quarter column in the dataset." },
  { label: "Month", reason: "CSR disclosures are annual — no month or date column in the dataset." },
  { label: "NGO", reason: "No implementing-agency name column in the dataset." },
  { label: "Status", reason: "No project status column in the dataset." },
];

export function FilterBar({ meta, filters }: { meta: Meta | null; filters: Filters }) {
  const [openChip, setOpenChip] = React.useState<string | null>(null);
  const setValues = useFilterStore((state) => state.setValues);
  const setRange = useFilterStore((state) => state.setRange);
  const clearAll = useFilterStore((state) => state.clearAll);
  const barRef = React.useRef<HTMLDivElement>(null);

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

      {CHIPS.map((chip) => {
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

      {DISABLED_CHIPS.map((chip) => (
        <button
          key={chip.label}
          type="button"
          className="select-chip"
          data-tip={chip.reason}
          style={{ opacity: 0.5, cursor: "not-allowed", borderStyle: "dashed" }}
          onClick={(event) => event.preventDefault()}
        >
          {chip.label}
        </button>
      ))}

      <div className="pos-rel">
        <button
          type="button"
          className={`select-chip${filters.minSpend !== null || filters.maxSpend !== null ? " active" : ""}`}
          onClick={() => setOpenChip(openChip === "amount" ? null : "amount")}
        >
          CSR Amount
          <ChevronDown width={12} height={12} />
        </button>
        {openChip === "amount" ? (
          <div
            className="dropdown open"
            style={{ top: 34, left: 0, right: "auto", width: 240, padding: 12 }}
          >
            <div className="mini-label no-rule" style={{ marginBottom: 8 }}>
              Project spend (INR Cr)
            </div>
            <div className="row gap-8">
              <input
                className="mono"
                defaultValue={filters.minSpend ?? ""}
                placeholder="min"
                onBlur={(event) =>
                  setRange(event.target.value === "" ? null : Number(event.target.value), filters.maxSpend)
                }
                style={{ width: "50%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}
              />
              <input
                className="mono"
                defaultValue={filters.maxSpend ?? ""}
                placeholder="max"
                onBlur={(event) =>
                  setRange(filters.minSpend, event.target.value === "" ? null : Number(event.target.value))
                }
                style={{ width: "50%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="spacer" />

      <button type="button" className="fb-text" onClick={() => window.dispatchEvent(new CustomEvent("cms:save-view"))}>
        <Save width={13} height={13} />
        Save
      </button>
      <button type="button" className="fb-text" onClick={clearAll} disabled={count === 0}>
        <RotateCcw width={13} height={13} />
        Reset{count ? ` (${count})` : ""}
      </button>
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
        <span>{selected.length} selected</span>
        <button type="button" className="fb-text" style={{ marginLeft: "auto" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
