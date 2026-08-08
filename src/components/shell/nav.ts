/** Navigation model — mirrors the draft sidebar, in the draft's order. */
export interface NavEntry {
  href: string;
  label: string;
  icon: string;
  group: "Platform" | "Insights & Data";
  kbd?: string;
}

export const NAV: NavEntry[] = [
  { href: "/", label: "Executive Dashboard", icon: "grid", group: "Platform", kbd: "1" },
  { href: "/company-analysis", label: "Company Analysis", icon: "building", group: "Platform", kbd: "2" },
  { href: "/state-analysis", label: "State Analysis", icon: "map", group: "Platform", kbd: "3" },
  { href: "/sector-analysis", label: "Sector Analysis", icon: "layers", group: "Platform", kbd: "4" },
  { href: "/ngo-analysis", label: "NGO Analysis", icon: "handshake", group: "Platform", kbd: "5" },
  { href: "/project-analytics", label: "Project Analytics", icon: "folder", group: "Platform", kbd: "6" },
  { href: "/trend-analysis", label: "Trend Analysis", icon: "trending", group: "Insights & Data", kbd: "7" },
  { href: "/reports", label: "Reports", icon: "report", group: "Insights & Data", kbd: "8" },
  { href: "/ai-insights", label: "AI Insights", icon: "sparkles", group: "Insights & Data", kbd: "9" },
  { href: "/data-explorer", label: "Data Explorer", icon: "database", group: "Insights & Data" },
  { href: "/data-upload", label: "Data Upload", icon: "upload", group: "Insights & Data" },
];

export const BREADCRUMB: Record<string, string> = Object.fromEntries(
  NAV.map((entry) => [entry.href, entry.label]),
);
