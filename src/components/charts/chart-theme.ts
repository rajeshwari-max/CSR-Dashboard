/** Shared Recharts styling helpers so every chart reads from the CSS tokens. */

export const CHART_COLORS = [
  "var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)",
  "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)",
];

export function colorAt(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const;

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
