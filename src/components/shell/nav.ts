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
  { href: "/state-analysis", label: "Explore Geography", icon: "map", group: "Explore", desc: "CSR by state and district" },
  { href: "/sector-analysis", label: "Explore Sectors", icon: "layers", group: "Explore", desc: "CSR by industry sector" },
  { href: "/aspirational-districts", label: "Aspirational Districts", icon: "target", group: "Explore", desc: "CSR reaching NITI Aayog's 112 districts" },
  { href: "/trend-analysis", label: "Trends & Comparisons", icon: "trending", group: "Analyse", desc: "Year-on-year change and comparisons" },
  { href: "/ngo-analysis", label: "Implementation Partners", icon: "handshake", group: "Analyse", desc: "How CSR projects are delivered" },
  { href: "/explore-data", label: "CSR Indicators", icon: "explore", group: "Analyse", desc: "Map and compare CSR indicators" },
  { href: "/ai-insights", label: "AI-powered Insights", icon: "sparkles", group: "Analyse", desc: "Automated findings and questions" },
  { href: "/reports", label: "Reports & Downloads", icon: "report", group: "Resources", desc: "PDF, Excel, PowerPoint and CSV" },
  { href: "/data-explorer", label: "Explore CSR Data", icon: "database", group: "Resources", desc: "Browse every reported project" },
  { href: "/glossary", label: "Glossary", icon: "book", group: "Resources", desc: "What the CSR terms mean" },
  { href: "/data-upload", label: "Data Management", icon: "upload", group: "Resources", desc: "Upload and update data", kbd: "Admin" },
];

export const BREADCRUMB: Record<string, string> = Object.fromEntries(
  NAV.map((entry) => [entry.href, entry.label]),
);
