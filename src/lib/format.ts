/** Display formatters. All monetary values are INR Crore unless stated. */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 1,234.56 Cr — with a Lakh-Crore rollup above 1,00,000 Cr. */
export function formatCrore(value: number | null | undefined, withSymbol = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = withSymbol ? "₹" : "";
  if (Math.abs(value) >= 100_000) return `${prefix}${inr.format(value / 100_000)} L Cr`;
  if (Math.abs(value) >= 1_000) return `${prefix}${inr0.format(value)} Cr`;
  if (Math.abs(value) >= 1) return `${prefix}${inr.format(value)} Cr`;
  return `${prefix}${inr.format(value * 100)} L`; // sub-crore shown in lakh
}

/** Compact axis/tick label: 1.2K, 34.9 */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000) return `${inr.format(value / 1_000)}K`;
  if (Math.abs(value) >= 100) return inr0.format(value);
  return inr.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return inr0.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "" : ""}${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatShare(share: number | null | undefined): string {
  if (share === null || share === undefined || Number.isNaN(share)) return "—";
  return `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`;
}

export function truncate(text: string | null | undefined, max = 90): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
