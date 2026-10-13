/** Display formatters. All monetary values are INR Crore unless stated. */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const tiny = new Intl.NumberFormat("en-IN", { maximumSignificantDigits: 2 });

/**
 * Every amount in ₹ crore, so a column never mixes units. (Values under
 * ₹1 Cr used to switch to lakh — "₹30 L" next to "₹2.33 Cr" — and totals over
 * 1,00,000 Cr to "L Cr", which contradicted the "amounts in ₹ crore" note.)
 *   68,652 Cr · 2.33 Cr · 0.3 Cr · 0.004 Cr
 */
export function formatCrore(value: number | null | undefined, withSymbol = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = withSymbol ? "₹" : "";
  if (value === 0) return `${prefix}0 Cr`;
  if (Math.abs(value) >= 1_000) return `${prefix}${inr0.format(value)} Cr`;
  if (Math.abs(value) >= 0.01) return `${prefix}${inr.format(value)} Cr`;
  return `${prefix}${tiny.format(value)} Cr`; // e.g. 0.004 Cr (₹40,000)
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

/** "Itc Limited" -> "ITC Limited": the source workbook title-cases acronyms. Also drops a stray trailing full stop. */
const ACRONYMS = new Set([
  "icici", "hdfc", "idbi", "idfc", "ntpc", "ongc", "sbi", "lic", "bhel", "gail", "nmdc", "nhpc", "sjvn", "irctc", "irfc",
  "rites", "hcl", "acc", "mrf", "dlf", "upl", "kec", "pnb", "bpcl", "hpcl", "iocl", "nlc", "sail", "rec", "pfc", "jsw",
  "itc", "tvs", "abb", "bse", "nse", "mmtc", "kpit", "ihcl", "ircon", "hudco", "ireda", "bel", "hal", "beml", "nbcc",
  "crisil", "gmr", "jk", "srf", "pi", "aia", "ptc", "cesc", "ksb", "skf", "lg", "gsk", "bnp", "ubs", "dcm", "gvk",
]);

export function displayCompanyName(name: string): string {
  return name
    .replace(/\.\s*$/, "")
    .split(" ")
    .map((word) =>
      ACRONYMS.has(word.toLowerCase().replace(/[^a-z]/g, "")) && /^[a-z]+$/i.test(word)
        ? word.toUpperCase()
        : /^[a-z]{2,4}$/i.test(word) && !/^(ltd|pvt|and|the|for|of|co|inc|plc|llp)$/i.test(word) && !/[aeiouy]/i.test(word.slice(1))
        ? word.toUpperCase()
        : word,
    )
    .join(" ");
}
