/** Shared types for the CSR dashboard (client + server). */

export interface Company {
  id: string;
  name: string;
  cin: string | null;
  sector: string;
  csrObligation: number | null;
  twoPercentNetProfit: number | null;
  averageNetProfit: number | null;
  totalOutlay: number | null;
  reportedSpend: number | null;
  policyUrl: string | null;
  annualReportUrl: string | null;
  brsrReportUrl: string | null;
  csrReportUrl: string | null;
  esgReportUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  listed: string | null;
  companyType: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
  sector: string;
}

/** Optional source columns. False = the panel renders an explicit empty state. */
export interface Capabilities {
  ngo: boolean;
  beneficiaries: boolean;
  status: boolean;
  start_date: boolean;
  end_date: boolean;
  sdg: boolean;
  duration: boolean;
}

export interface ColumnCoverage {
  present: boolean;
  filled: number;
  coveragePct: number;
  available: boolean;
}

export interface SourceFile {
  file: string;
  sheets: string[];
}

/** Small payload safe to ship to the browser — powers every filter control. */
export interface Meta {
  generatedAt: string;
  sources: SourceFile[];
  currency: string;
  capabilities: Capabilities;
  columnCoverage: Record<string, ColumnCoverage>;
  rowCount: number;
  companyCount: number;
  totalSpend: number;
  years: string[];
  sectors: string[];
  states: string[];
  themes: string[];
  modes: string[];
  districts: string[];
  ngos: string[];
  statuses: string[];
  companies: CompanyOption[];
  spendByYear: Record<string, number>;
  stats: Record<string, number>;
}

export interface Filters {
  years: string[];
  sectors: string[];
  states: string[];
  districts: string[];
  themes: string[];
  companies: string[];
  modes: string[];
  search: string;
  minSpend: number | null;
  maxSpend: number | null;
  aspirationalOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  years: [],
  sectors: [],
  states: [],
  districts: [],
  themes: [],
  companies: [],
  modes: [],
  search: "",
  minSpend: null,
  maxSpend: null,
  aspirationalOnly: false,
};

export type Dimension = "company" | "sector" | "state" | "district" | "theme" | "mode" | "year";

export interface Kpis {
  totalSpend: number;
  companyCount: number;
  projectCount: number;
  avgSpendPerCompany: number;
  medianSpendPerCompany: number;
  avgProjectSize: number;
  latestYear: string | null;
  previousYear: string | null;
  yoyGrowthPct: number | null;
  latestYearSpend: number;
  stateCount: number;
  districtCount: number;
  sectorCount: number;
  themeCount: number;
  aspirationalSpend: number;
  aspirationalShare: number;
  /**
   * Share of companies that met their disclosed CSR obligation in the latest
   * year in view. Only companies that actually disclose an obligation are
   * counted — `complianceBase` is that denominator, so the figure is never
   * presented as if it covered every filer.
   */
  complianceRate: number | null;
  complianceBase: number;
  complianceMet: number;
  complianceSparkline: { label: string; value: number }[];
  districtSparkline: { label: string; value: number }[];
  beneficiarySparkline: { label: string; value: number }[];
  /** Null until a beneficiaries column exists in the uploaded data. */
  beneficiaries: number | null;
  top10Share: number;
  spendSparkline: { label: string; value: number }[];
  companySparkline: { label: string; value: number }[];
  projectSparkline: { label: string; value: number }[];
  avgSparkline: { label: string; value: number }[];
}

export interface NamedValue {
  name: string;
  value: number;
  count?: number;
  id?: string;
  share?: number;
  companies?: number;
  yoyGrowthPct?: number | null;
  latest?: number;
  previous?: number;
  extra?: string | null;
}

export interface TrendPoint {
  year: string;
  spend: number;
  /**
   * Sum of the disclosed "Project Amount Outlay" column. NOTE: in the source
   * workbook this column repeats a company-level total on every project row for
   * part of FY 2020-21, so the aggregate is not comparable to `spend`. Returned
   * for completeness but deliberately not charted.
   */
  outlay: number;
  projects: number;
  companies: number;
}

export interface SummaryResponse {
  kpis: Kpis;
  trend: TrendPoint[];
  topCompanies: NamedValue[];
  bySector: NamedValue[];
  byState: NamedValue[];
  byTheme: NamedValue[];
  byMode: NamedValue[];
  byDistrict: NamedValue[];
  filteredRows: number;
  generatedAt: string;
}

export interface BreakdownResponse {
  dimension: Dimension;
  rows: NamedValue[];
  total: number;
  projectCount: number;
  years: string[];
  /** dimension value -> per-year spend, for stacked / small-multiple charts. */
  series: { name: string; values: Record<string, number> }[];
  generatedAt: string;
}

export interface ProjectRow {
  id: number;
  company: string;
  companyId: string;
  year: string;
  sector: string;
  state: string;
  district: string | null;
  theme: string;
  mode: string;
  project: string | null;
  outlay: number | null;
  spent: number | null;
  ngo: string | null;
  beneficiaries: number | null;
  status: string | null;
  aspirational: boolean;
}

export type SortField =
  | "company" | "year" | "spent" | "outlay" | "sector" | "state" | "district" | "theme" | "mode";
export type SortDirection = "asc" | "desc";

export interface ProjectsResponse {
  rows: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  totalSpendInView: number;
}

export interface CompanyDetail {
  company: Company;
  kpis: {
    totalSpend: number;
    latestYearSpend: number;
    projectCount: number;
    stateCount: number;
    themeCount: number;
    yoyGrowthPct: number | null;
    obligation: number | null;
    utilisationPct: number | null;
    nationalRank: number | null;
    nationalShare: number;
    sectorRank: number | null;
    aspirationalShare: number;
  };
  trend: TrendPoint[];
  byTheme: NamedValue[];
  byState: NamedValue[];
  byMode: NamedValue[];
  topProjects: ProjectRow[];
  peers: NamedValue[];
}

export interface ComparisonRow {
  id: string;
  name: string;
  sector: string;
  totalSpend: number;
  latestYearSpend: number;
  projectCount: number;
  stateCount: number;
  themeCount: number;
  yoyGrowthPct: number | null;
  obligation: number | null;
  utilisationPct: number | null;
  avgProjectSize: number;
  topTheme: string | null;
  topState: string | null;
  byYear: Record<string, number>;
}

export interface ComparisonResponse {
  companies: ComparisonRow[];
  years: string[];
}

// --- Insights --------------------------------------------------------------

export type InsightSeverity = "positive" | "neutral" | "warning" | "critical";
export type InsightKind = "trend" | "concentration" | "anomaly" | "gap" | "quality" | "forecast";

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Numbers the sentence is built from — shown as chips so nothing is unverifiable. */
  evidence: { label: string; value: string }[];
  /** Optional filter to apply when the user clicks "investigate". */
  action?: { label: string; filters: Partial<Filters> };
}

export interface ForecastPoint {
  year: string;
  spend: number | null;
  projected: number | null;
  lower: number | null;
  upper: number | null;
}

export interface AnomalyRow {
  name: string;
  id?: string;
  year: string;
  value: number;
  expected: number;
  deviationPct: number;
  zScore: number;
  direction: "spike" | "drop";
}

export interface InsightsResponse {
  generatedAt: string;
  scope: string;
  summary: string[];
  insights: Insight[];
  forecast: {
    points: ForecastPoint[];
    method: string;
    caveat: string;
    r2: number | null;
    nextYear: string | null;
    nextYearSpend: number | null;
  };
  anomalies: AnomalyRow[];
  recommendations: { title: string; detail: string; impact: string }[];
  dataQuality: { label: string; value: string; severity: InsightSeverity }[];
  llm: { available: boolean; narrative: string | null; model: string | null };
}

export interface ChatResponse {
  available: boolean;
  answer: string;
  facts: Record<string, unknown>;
  model: string | null;
}

export interface ApiError {
  error: string;
  detail?: string;
}
