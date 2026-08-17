"use client";

import * as React from "react";
import indiaMap from "@svg-maps/india";

import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NamedValue } from "@/types";

/**
 * State-wise choropleth.
 *
 * Uses the self-contained SVG path set from `@svg-maps/india` rather than a
 * remote TopoJSON file, so the map renders offline with no projection maths
 * and no extra network request.
 *
 * Rows that are not mappable to a polygon ("Pan India", "Not Specified") are
 * surfaced as chips underneath instead of being silently dropped — for this
 * dataset that is a material share of total spend.
 */

const NON_GEOGRAPHIC = new Set(["Pan India", "Not Specified"]);

/** Single-hue sequential ramp — the convention for a quantity choropleth. */
const HEAT_STOPS: [number, number, number][] = [
  [237, 242, 252],
  [199, 213, 240],
  [147, 170, 222],
  [90, 119, 196],
  [47, 75, 199],
];

function heatColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (HEAT_STOPS.length - 1);
  const index = Math.min(Math.floor(scaled), HEAT_STOPS.length - 2);
  const ratio = scaled - index;
  const from = HEAT_STOPS[index];
  const to = HEAT_STOPS[index + 1];
  const mix = from.map((channel, position) => Math.round(channel + (to[position] - channel) * ratio));
  return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
}

/** Data label -> SVG location name, where the two vocabularies differ. */
const TO_MAP_NAME: Record<string, string> = {
  Ladakh: "Jammu and Kashmir", // the 2020 SVG predates the UT split
  Odisha: "Odisha",
  Uttarakhand: "Uttarakhand",
  Puducherry: "Puducherry",
  Delhi: "Delhi",
};

interface IndiaMapProps {
  data: NamedValue[];
  selected: string[];
  onSelect?: (state: string) => void;
}

export function IndiaMap({ data, selected, onSelect }: IndiaMapProps) {
  const [hover, setHover] = React.useState<{ name: string; x: number; y: number } | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const { byMapName, max, total, unmapped } = React.useMemo(() => {
    const lookup = new Map<string, NamedValue>();
    const leftovers: NamedValue[] = [];
    let peak = 0;
    let sum = 0;

    for (const row of data) {
      sum += row.value;
      if (NON_GEOGRAPHIC.has(row.name)) {
        leftovers.push(row);
        continue;
      }
      const mapName = TO_MAP_NAME[row.name] ?? row.name;
      const existing = lookup.get(mapName);
      if (existing) {
        existing.value = Math.round((existing.value + row.value) * 100) / 100;
        existing.count = (existing.count ?? 0) + (row.count ?? 0);
      } else {
        lookup.set(mapName, { ...row, name: mapName });
      }
      peak = Math.max(peak, lookup.get(mapName)!.value);
    }
    return { byMapName: lookup, max: peak, total: sum, unmapped: leftovers };
  }, [data]);

  const intensity = (value: number) => {
    if (!max || value <= 0) return 0;
    // sqrt scale: CSR spend is heavily right-skewed (Maharashtra dwarfs the rest)
    return Math.min(1, Math.sqrt(value / max));
  };

  const hovered = hover ? byMapName.get(hover.name) : null;

  return (
    <div ref={wrapperRef} className="relative flex h-full flex-col gap-3 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={indiaMap.viewBox}
          role="img"
          aria-label="CSR spend by Indian state"
          className="size-full"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          {indiaMap.locations.map((location) => {
            // `name` is optional in the SVG map typings — fall back to the id.
            const locationName = location.name ?? location.id;
            const row = byMapName.get(locationName);
            const value = row?.value ?? 0;
            const isSelected = selected.some(
              (state) => (TO_MAP_NAME[state] ?? state) === locationName,
            );
            return (
              <path
                key={location.id}
                d={location.path}
                tabIndex={onSelect ? 0 : -1}
                role={onSelect ? "button" : undefined}
                aria-label={`${locationName}: ${formatCrore(value)}`}
                onMouseMove={(event) => {
                  const bounds = wrapperRef.current?.getBoundingClientRect();
                  setHover({
                    name: locationName,
                    x: event.clientX - (bounds?.left ?? 0),
                    y: event.clientY - (bounds?.top ?? 0),
                  });
                }}
                onClick={() => onSelect?.(row?.name ?? locationName)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect?.(row?.name ?? locationName);
                }}
                className={cn(
                  "outline-none transition-[fill,stroke] duration-150",
                  onSelect && "cursor-pointer",
                  isSelected ? "stroke-foreground" : "stroke-card",
                )}
                strokeWidth={isSelected ? 1.6 : 0.6}
                fill={value > 0 ? heatColor(intensity(value)) : "var(--surface-2)"}
              />
            );
          })}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-pop"
            style={{ left: hover.x, top: hover.y - 10 }}
          >
            <p className="font-semibold">{hover.name}</p>
            <p className="numeric mt-0.5 text-muted-foreground">
              {formatCrore(hovered?.value ?? 0)} · {formatNumber(hovered?.count ?? 0)} projects
            </p>
            <p className="numeric text-[11px] text-muted-foreground">
              {formatShare(total ? (hovered?.value ?? 0) / total : 0)} of filtered spend
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col justify-between gap-3 lg:w-44">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Spend intensity</p>
          <div className="mt-2 h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#edf2fc,#c7d5f0,#93aade,#5a77c4,#2f4bc7)" }} />
          <div className="numeric mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>₹0</span>
            <span>{formatCrore(max)}</span>
          </div>
        </div>

        {unmapped.length ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Not state-attributed
            </p>
            {unmapped.map((row) => (
              <button
                key={row.name}
                type="button"
                onClick={() => onSelect?.(row.name)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/60"
              >
                <span className="truncate text-muted-foreground">{row.name}</span>
                <span className="numeric shrink-0 font-semibold">{formatCrore(row.value)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
