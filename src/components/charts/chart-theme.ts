/** Shared Recharts styling helpers so every chart reads from the CSS tokens. */

export const CHART_COLORS = [
  "var(--c1)", "var(--c2)", "var(--c3)",
  "var(--c4)", "var(--c5)", "var(--c6)",
];

export function colorAt(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const;

/** Axis titles: every chart names what each axis measures and its unit. */
export const AXIS_TITLE_STYLE = { fontSize: 11, fill: "var(--text-soft)", textAnchor: "middle" } as const;

export function xTitle(value: string, offset = -12) {
  return { value, position: "insideBottom" as const, offset, style: AXIS_TITLE_STYLE };
}

export function yTitle(value: string, side: "left" | "right" = "left", offset = 4) {
  return {
    value,
    angle: side === "left" ? -90 : 90,
    position: side === "left" ? ("insideLeft" as const) : ("insideRight" as const),
    offset,
    style: AXIS_TITLE_STYLE,
  };
}

export const TOOLTIP_STYLES = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 12,
    boxShadow: "0 12px 40px -12px rgb(15 23 42 / 0.28)",
  },
  labelStyle: { fontWeight: 600, marginBottom: 4 },
  cursor: { fill: "var(--surface-2)", opacity: 0.5 },
} as const;
