/** Navigation model: three sections (Explore, Analyse, Resources), each item with a short hover description. */
export interface NavEntry {
  href: string;
  label: string;
  icon: string;
  group: "Explore" | "Analyse" | "Resources";
  /** One line shown under the item on hover. */
  desc: string;
  /** Small tag on the right, e.g. "Admin". */
  kbd?: string;
}

export const NAV_GROUPS = ["Explore", "Analyse", "Resources"] as const;

export const NAV: NavEntry[] = [
  { href: "/", label: "Overview", icon: "grid", group: "Explore", desc: "India's CSR at a glance" },
  { href: "/company-analysis", label: "CSR Insights", icon: "building", group: "Explore", desc: "Companies, CSR spending and unspent CSR" },
  { href: "/state-analysis", label: "CSR by Geography", icon: "map", group: "Explore", desc: "CSR spending by state and district" },
  { href: "/sector-analysis", label: "CSR by Sector", icon: "layers", group: "Explore", desc: "CSR spending by industry sector and Schedule VII area" },
  { href: "/aspirational-districts", label: "Aspirational Districts", icon: "target", group: "Explore", desc: "CSR reaching NITI Aayog's 112 districts" },
  { href: "/trend-analysis", label: "Trends & Comparisons", icon: "trending", group: "Analyse", desc: "Year-on-year change and comparisons" },
  { href: "/ai-insights", label: "AI-powered Insights", icon: "sparkles", group: "Analyse", desc: "Automated findings and questions" },
  { href: "/reports", label: "Reports & Downloads", icon: "report", group: "Resources", desc: "PDF, Excel, PowerPoint and CSV" },
  { href: "/data-explorer", label: "CSR Data", icon: "database", group: "Resources", desc: "Every reported CSR project in one table" },
  { href: "/glossary", label: "Glossary", icon: "book", group: "Resources", desc: "What the CSR terms mean" },
  { href: "/data-upload", label: "Data Management", icon: "upload", group: "Resources", desc: "Upload and update data", kbd: "Admin" },
];

export const BREADCRUMB: Record<string, string> = Object.fromEntries(
  NAV.map((entry) => [entry.href, entry.label]),
);
