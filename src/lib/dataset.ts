/**
 * Server-side dataset + query engine.
 *
 * `data/dataset.json` (produced by scripts/etl.py) is dictionary encoded. On
 * first request we decode it into typed arrays and cache the result on
 * `globalThis` so it survives hot reloads in dev and warm lambdas in prod.
 *
 * Every query is a single linear scan over the fact table using Int32Array
 * columns — sub-millisecond at this size — so there is no database to run.
 */

import fs from "node:fs";
import path from "node:path";

import { REPORTING_START_YEAR } from "@/types";
import type {
  Capabilities,
  ColumnCoverage,
  Company,
  CompanyDetail,
  ComparisonResponse,
  ComparisonRow,
  Dimension,
  BreakdownResponse,
  Filters,
  Kpis,
  Meta,
  NamedValue,
  ProjectRow,
  ProjectsResponse,
  SortDirection,
  SortField,
  SourceFile,
  SummaryResponse,
  TrendPoint,
} from "@/types";

/*
 * On a host with a mounted persistent disk (Render, Railway, a VPS) point
 * CSR_DATA_DIR at that mount so uploaded datasets survive redeploys. Falls back
 * to ./data for local development.
 */
const DATA_DIR = process.env.CSR_DATA_DIR
  ? path.resolve(process.env.CSR_DATA_DIR)
  : path.join(process.cwd(), "data");

type RawRow = [
  number, number, number, number, number, number, number,
  number | null, number | null, string | null,
  number, number | null, number, number, number,
];

interface RawDataset {
  generatedAt: string;
  sources: SourceFile[];
  currency: string;
  schema: string[];
  capabilities: Capabilities;
  columnCoverage: Record<string, ColumnCoverage>;
  dictionaries: {
    companies: Company[];
    years: string[];
    sectors: string[];
    states: string[];
    themes: string[];
    modes: string[];
    districts: string[];
    ngos: string[];
    statuses: string[];
    sdgs: string[];
  };
  rows: RawRow[];
  stats: Record<string, number>;
}

export interface Dataset {
  generatedAt: string;
  sources: SourceFile[];
  currency: string;
  capabilities: Capabilities;
  columnCoverage: Record<string, ColumnCoverage>;
  count: number;
  companies: Company[];
  years: string[];
  sectors: string[];
  states: string[];
  themes: string[];
  modes: string[];
  districts: string[];
  ngos: string[];
  statuses: string[];
  companyIdx: Int32Array;
  yearIdx: Int32Array;
  sectorIdx: Int32Array;
  stateIdx: Int32Array;
  themeIdx: Int32Array;
  modeIdx: Int32Array;
  districtIdx: Int32Array;
  ngoIdx: Int32Array;
  statusIdx: Int32Array;
  aspirational: Uint8Array;
  outlay: Float64Array;
  spent: Float64Array;
  beneficiaries: Float64Array;
  projects: (string | null)[];
  searchBlob: string[];
  companyIdToIndex: Map<string, number>;
  /** Sorted ascending — every year-over-year calculation walks this. */
  yearOrder: number[];
  stats: Record<string, number>;
}

declare global {
  // eslint-disable-next-line no-var
  var __csrDataset: Dataset | undefined;
  // eslint-disable-next-line no-var
  var __csrMeta: Meta | undefined;
}

export class DatasetMissingError extends Error {
  constructor(file: string) {
    super(
      `Dataset not found at ${file}. Run "npm run etl" (or "python scripts/etl.py") ` +
        `after placing your workbook(s) in data/raw/.`,
    );
    this.name = "DatasetMissingError";
  }
}

function readJson<T>(file: string): T {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) throw new DatasetMissingError(full);
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Include FY 2021-22 and every later financial year present in an uploaded dataset. */
function isReportingYear(label: string): boolean {
  const match = /^FY\s+(\d{4})-\d{2}$/.exec(label.trim());
  return match !== null && Number.parseInt(match[1], 10) >= REPORTING_START_YEAR;
}

export function getDataset(): Dataset {
  if (globalThis.__csrDataset) return globalThis.__csrDataset;

  const raw = readJson<RawDataset>("dataset.json");
  const n = raw.rows.length;
  const d = raw.dictionaries;

  const dataset: Dataset = {
    generatedAt: raw.generatedAt,
    sources: raw.sources,
    currency: raw.currency,
    capabilities: raw.capabilities,
    columnCoverage: raw.columnCoverage,
    count: n,
    companies: d.companies,
    years: d.years,
    sectors: d.sectors,
    states: d.states,
    themes: d.themes,
    modes: d.modes,
    districts: d.districts,
    ngos: d.ngos,
    statuses: d.statuses,
    companyIdx: new Int32Array(n),
    yearIdx: new Int32Array(n),
    sectorIdx: new Int32Array(n),
    stateIdx: new Int32Array(n),
    themeIdx: new Int32Array(n),
    modeIdx: new Int32Array(n),
    districtIdx: new Int32Array(n),
    ngoIdx: new Int32Array(n),
    statusIdx: new Int32Array(n),
    aspirational: new Uint8Array(n),
    outlay: new Float64Array(n),
    spent: new Float64Array(n),
    beneficiaries: new Float64Array(n),
    projects: new Array(n),
    searchBlob: new Array(n),
    companyIdToIndex: new Map(),
    yearOrder: [],
    stats: raw.stats,
  };

  d.companies.forEach((company, index) => dataset.companyIdToIndex.set(company.id, index));

  for (let i = 0; i < n; i += 1) {
    const row = raw.rows[i];
    dataset.companyIdx[i] = row[0];
    dataset.yearIdx[i] = row[1];
    dataset.sectorIdx[i] = row[2];
    dataset.stateIdx[i] = row[3];
    dataset.themeIdx[i] = row[4];
    dataset.modeIdx[i] = row[5];
    dataset.districtIdx[i] = row[6];
    dataset.outlay[i] = row[7] ?? Number.NaN;
    dataset.spent[i] = row[8] ?? Number.NaN;
    dataset.projects[i] = row[9];
    dataset.ngoIdx[i] = row[10] ?? -1;
    dataset.beneficiaries[i] = row[11] ?? Number.NaN;
    dataset.statusIdx[i] = row[12] ?? -1;
    dataset.aspirational[i] = row[14] ? 1 : 0;
    dataset.searchBlob[i] =
      `${d.companies[row[0]]?.name ?? ""} ${row[9] ?? ""} ${d.themes[row[4]] ?? ""} ` +
      `${d.states[row[3]] ?? ""} ${row[6] >= 0 ? d.districts[row[6]] : ""}`.toLowerCase();
  }

  dataset.yearOrder = [...d.years.keys()]
    .filter((index) => isReportingYear(d.years[index]))
    .sort((a, b) => d.years[a].localeCompare(d.years[b]));

  globalThis.__csrDataset = dataset;
  return dataset;
}

export function getMeta(): Meta {
  if (!globalThis.__csrMeta) {
    const base = readJson<Meta>("meta.json");
    const data = getDataset();
    const reportingYears = data.years.filter(isReportingYear);
    const allowedYears = new Set(reportingYears);
    const allowedYearIndexes = new Set(
      data.years.flatMap((year, index) => (allowedYears.has(year) ? [index] : [])),
    );
    const companies = new Set<number>();
    const spendByYear: Record<string, number> = {};
    let rowCount = 0;
    let totalSpend = 0;

    for (let i = 0; i < data.count; i += 1) {
      if (!allowedYearIndexes.has(data.yearIdx[i])) continue;
      rowCount += 1;
      companies.add(data.companyIdx[i]);
      const spent = data.spent[i];
      if (!Number.isNaN(spent)) {
        totalSpend += spent;
        const year = data.years[data.yearIdx[i]];
        spendByYear[year] = (spendByYear[year] ?? 0) + spent;
      }
    }

    globalThis.__csrMeta = {
      ...base,
      rowCount,
      companyCount: companies.size,
      totalSpend: round(totalSpend),
      years: [...reportingYears].sort((a, b) => a.localeCompare(b)),
      spendByYear: Object.fromEntries(
        Object.entries(spendByYear).map(([year, value]) => [year, round(value)]),
      ),
    };
  }
  return globalThis.__csrMeta;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function indexSet(values: string[], dictionary: string[]): Set<number> | null {
  if (!values.length) return null;
  const wanted = new Set(values.map((value) => value.toLowerCase()));
  const result = new Set<number>();
  dictionary.forEach((label, index) => {
    if (wanted.has(label.toLowerCase())) result.add(index);
  });
  return result;
}

export function selectRows(filters: Filters): Int32Array {
  const data = getDataset();
  const years = indexSet(filters.years, data.years);
  const reportingYears = indexSet(data.years.filter(isReportingYear), data.years);
  const sectors = indexSet(filters.sectors, data.sectors);
  const states = indexSet(filters.states, data.states);
  const districts = indexSet(filters.districts, data.districts);
  const themes = indexSet(filters.themes, data.themes);
  const modes = indexSet(filters.modes, data.modes);

  let companies: Set<number> | null = null;
  if (filters.companies.length) {
    companies = new Set<number>();
    for (const id of filters.companies) {
      const index = data.companyIdToIndex.get(id);
      if (index !== undefined) companies.add(index);
    }
  }

  const term = filters.search.trim().toLowerCase();
  const min = filters.minSpend;
  const max = filters.maxSpend;
  const out = new Int32Array(data.count);
  let size = 0;

  for (let i = 0; i < data.count; i += 1) {
    if (reportingYears && !reportingYears.has(data.yearIdx[i])) continue;
    if (years && !years.has(data.yearIdx[i])) continue;
    if (sectors && !sectors.has(data.sectorIdx[i])) continue;
    if (states && !states.has(data.stateIdx[i])) continue;
    if (districts && !districts.has(data.districtIdx[i])) continue;
    if (themes && !themes.has(data.themeIdx[i])) continue;
    if (modes && !modes.has(data.modeIdx[i])) continue;
    if (companies && !companies.has(data.companyIdx[i])) continue;
    if (filters.aspirationalOnly && !data.aspirational[i]) continue;
    if (min !== null || max !== null) {
      const value = data.spent[i];
      if (Number.isNaN(value)) continue;
      if (min !== null && value < min) continue;
      if (max !== null && value > max) continue;
    }
    if (term && !data.searchBlob[i].includes(term)) continue;
    out[size] = i;
    size += 1;
  }
  return out.subarray(0, size);
}

// ---------------------------------------------------------------------------
// Dimension plumbing
// ---------------------------------------------------------------------------

interface DimensionSpec {
  keys: Int32Array;
  labels: string[];
  ids?: string[];
}

export function dimensionSpec(data: Dataset, dimension: Dimension): DimensionSpec {
  switch (dimension) {
    case "company":
      return {
        keys: data.companyIdx,
        labels: data.companies.map((company) => company.name),
        ids: data.companies.map((company) => company.id),
      };
    case "sector":
      return { keys: data.sectorIdx, labels: data.sectors };
    case "state":
      return { keys: data.stateIdx, labels: data.states };
    case "district":
      return { keys: data.districtIdx, labels: data.districts };
    case "theme":
      return { keys: data.themeIdx, labels: data.themes };
    case "mode":
      return { keys: data.modeIdx, labels: data.modes };
    case "year":
    default:
      return { keys: data.yearIdx, labels: data.years };
  }
}

/** Group rows by a dimension, with per-year splits and YoY growth. */
export function groupBy(
  rows: Int32Array,
  dimension: Dimension,
): { rows: NamedValue[]; series: { name: string; values: Record<string, number> }[]; total: number } {
  const data = getDataset();
  const spec = dimensionSpec(data, dimension);
  const size = spec.labels.length;

  const sums = new Float64Array(size);
  const counts = new Int32Array(size);
  const companySets: Set<number>[] = Array.from({ length: size }, () => new Set<number>());
  const perYear: Float64Array[] = Array.from({ length: size }, () => new Float64Array(data.years.length));
  let total = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const key = spec.keys[row];
    if (key < 0) continue;
    const value = data.spent[row];
    if (!Number.isNaN(value)) {
      sums[key] += value;
      total += value;
      const year = data.yearIdx[row];
      if (year >= 0) perYear[key][year] += value;
    }
    counts[key] += 1;
    companySets[key].add(data.companyIdx[row]);
  }

  const order = data.yearOrder;
  const result: NamedValue[] = [];
  const series: { name: string; values: Record<string, number> }[] = [];

  for (let k = 0; k < size; k += 1) {
    if (counts[k] === 0) continue;
    const yearValues: Record<string, number> = {};
    for (const yi of order) yearValues[data.years[yi]] = round(perYear[k][yi]);

    const latestIdx = order[order.length - 1];
    const previousIdx = order.length > 1 ? order[order.length - 2] : -1;
    const latest = latestIdx >= 0 ? perYear[k][latestIdx] : 0;
    const previous = previousIdx >= 0 ? perYear[k][previousIdx] : 0;

    result.push({
      name: spec.labels[k],
      id: spec.ids?.[k],
      value: round(sums[k]),
      count: counts[k],
      companies: companySets[k].size,
      share: total > 0 ? sums[k] / total : 0,
      latest: round(latest),
      previous: round(previous),
      yoyGrowthPct: previous > 0 ? round(((latest - previous) / previous) * 100) : null,
    });
    series.push({ name: spec.labels[k], values: yearValues });
  }

  result.sort((a, b) => b.value - a.value);
  series.sort(
    (a, b) =>
      Object.values(b.values).reduce((s, v) => s + v, 0) -
      Object.values(a.values).reduce((s, v) => s + v, 0),
  );
  return { rows: result, series, total: round(total) };
}

export function buildBreakdown(
  filters: Filters,
  dimension: Dimension,
  limit = 500,
): BreakdownResponse {
  const data = getDataset();
  const rows = selectRows(filters);
  const grouped = groupBy(rows, dimension);
  return {
    dimension,
    rows: grouped.rows.slice(0, limit),
    total: grouped.total,
    projectCount: rows.length,
    years: data.yearOrder.map((index) => data.years[index]),
    series: grouped.series.slice(0, Math.min(limit, 30)),
    generatedAt: data.generatedAt,
  };
}

// ---------------------------------------------------------------------------
// Trend + KPIs
// ---------------------------------------------------------------------------

export function buildTrend(rows: Int32Array): TrendPoint[] {
  const data = getDataset();
  const spend = new Float64Array(data.years.length);
  const outlay = new Float64Array(data.years.length);
  const projects = new Int32Array(data.years.length);
  const companies: Set<number>[] = data.years.map(() => new Set<number>());

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const year = data.yearIdx[row];
    if (year < 0) continue;
    const s = data.spent[row];
    const o = data.outlay[row];
    if (!Number.isNaN(s)) spend[year] += s;
    if (!Number.isNaN(o)) outlay[year] += o;
    projects[year] += 1;
    companies[year].add(data.companyIdx[row]);
  }

  return data.yearOrder
    .filter((index) => projects[index] > 0)
    .map((index) => ({
      year: data.years[index],
      spend: round(spend[index]),
      outlay: round(outlay[index]),
      projects: projects[index],
      companies: companies[index].size,
    }));
}

/**
 * Unfiltered spend per company for one financial year. Cached per year because
 * compliance needs it once per sparkline point on every request.
 */
function latestYearSpendByCompany(yearIndex: number): Float64Array {
  const data = getDataset();
  const key = `__csrYearSpend_${data.generatedAt}_${yearIndex}`;
  const store = globalThis as unknown as Record<string, Float64Array | undefined>;
  if (store[key]) return store[key]!;

  const totals = new Float64Array(data.companies.length);
  if (yearIndex >= 0) {
    for (let i = 0; i < data.count; i += 1) {
      if (data.yearIdx[i] !== yearIndex) continue;
      const value = data.spent[i];
      if (!Number.isNaN(value)) totals[data.companyIdx[i]] += value;
    }
  }
  store[key] = totals;
  return totals;
}

function sparkline(trend: TrendPoint[], pick: (point: TrendPoint) => number) {
  return trend.map((point) => ({ label: point.year, value: pick(point) }));
}

export function buildSummary(filters: Filters, topN = 12): SummaryResponse {
  const data = getDataset();
  const rows = selectRows(filters);
  const trend = buildTrend(rows);

  const byCompany = groupBy(rows, "company");
  const bySector = groupBy(rows, "sector");
  const byState = groupBy(rows, "state");
  const byTheme = groupBy(rows, "theme");
  const byMode = groupBy(rows, "mode");
  const byDistrict = groupBy(rows, "district");

  let totalSpend = 0;
  let spentRows = 0;
  let aspirationalSpend = 0;
  const districts = new Set<number>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const value = data.spent[row];
    if (!Number.isNaN(value)) {
      totalSpend += value;
      spentRows += 1;
      if (data.aspirational[row]) aspirationalSpend += value;
    }
    if (data.districtIdx[row] >= 0) districts.add(data.districtIdx[row]);
  }

  /*
   * Compliance.
   *
   * The obligation on a filing is a whole-company figure, so it can only be
   * compared against that company's *whole* spend for the year. Measuring it
   * against spend inside the current filter would make every company look
   * non-compliant the moment you filter by state or sector — the numerator
   * shrinks while the denominator stays put.
   *
   * So: the set of companies comes from the current view, but each one's spend
   * is its unfiltered national total for the latest year.
   */
  const complianceYear = data.yearOrder.length ? data.yearOrder[data.yearOrder.length - 1] : -1;
  const nationalLatestSpend = latestYearSpendByCompany(complianceYear);

  let complianceBase = 0;
  let complianceMet = 0;
  for (const row of byCompany.rows) {
    const index = row.id ? data.companyIdToIndex.get(row.id) : undefined;
    if (index === undefined) continue;
    const company = data.companies[index];
    const obligation = company.csrObligation ?? company.twoPercentNetProfit;
    if (!obligation || obligation <= 0) continue;
    complianceBase += 1;
    // 5% tolerance absorbs rounding in the source filings.
    if (nationalLatestSpend[index] >= obligation * 0.95) complianceMet += 1;
  }

  // Distinct districts reached per year, for the Districts Reached card.
  const districtsPerYear: Set<number>[] = data.years.map(() => new Set<number>());
  const beneficiariesPerYear = new Float64Array(data.years.length);
  let beneficiaryTotal = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const year = data.yearIdx[row];
    if (year < 0) continue;
    if (data.districtIdx[row] >= 0) districtsPerYear[year].add(data.districtIdx[row]);
    const people = data.beneficiaries[row];
    if (!Number.isNaN(people)) {
      beneficiariesPerYear[year] += people;
      beneficiaryTotal += people;
    }
  }
  const districtSparkline = data.yearOrder.map((yearIndex) => ({
    label: data.years[yearIndex],
    value: districtsPerYear[yearIndex].size,
  }));
  const beneficiarySparkline = data.yearOrder.map((yearIndex) => ({
    label: data.years[yearIndex],
    value: round(beneficiariesPerYear[yearIndex]),
  }));

  // Per-year compliance, so the card's sparkline shows a real series.
  const complianceSparkline = data.yearOrder.map((yearIndex) => {
    const spend = latestYearSpendByCompany(yearIndex);
    let base = 0;
    let met = 0;
    for (const row of byCompany.rows) {
      const index = row.id ? data.companyIdToIndex.get(row.id) : undefined;
      if (index === undefined) continue;
      const company = data.companies[index];
      const obligation = company.csrObligation ?? company.twoPercentNetProfit;
      if (!obligation || obligation <= 0) continue;
      base += 1;
      if (spend[index] >= obligation * 0.95) met += 1;
    }
    return { label: data.years[yearIndex], value: base ? round((met / base) * 100) : 0 };
  });

  /*
   * Median is taken over companies that disclosed an amount. 152 companies in
   * the current file have rows but no figure; counting them as ₹0 would drag
   * the median toward zero and misrepresent the typical filer. They remain in
   * the company *count* — they did report projects.
   */
  const perCompany = byCompany.rows
    .map((row) => row.value)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const median = perCompany.length
    ? perCompany.length % 2
      ? perCompany[(perCompany.length - 1) / 2]
      : (perCompany[perCompany.length / 2 - 1] + perCompany[perCompany.length / 2]) / 2
    : 0;

  const latest = trend.length ? trend[trend.length - 1] : null;
  const previous = trend.length > 1 ? trend[trend.length - 2] : null;
  const top10 = byCompany.rows.slice(0, 10).reduce((sum, row) => sum + row.value, 0);

  const kpis: Kpis = {
    totalSpend: round(totalSpend),
    companyCount: byCompany.rows.length,
    projectCount: rows.length,
    avgSpendPerCompany: byCompany.rows.length ? round(totalSpend / byCompany.rows.length) : 0,
    medianSpendPerCompany: round(median),
    avgProjectSize: spentRows ? round(totalSpend / spentRows, 3) : 0,
    latestYear: latest?.year ?? null,
    previousYear: previous?.year ?? null,
    yoyGrowthPct:
      latest && previous && previous.spend > 0
        ? round(((latest.spend - previous.spend) / previous.spend) * 100)
        : null,
    latestYearSpend: latest?.spend ?? 0,
    // "Pan India" and "Not Specified" are filing conventions, not places, and
    // "Unclassified" is not a sector — counting them would overstate reach.
    stateCount: byState.rows.filter(
      (row) => row.name !== "Pan India" && row.name !== "Not Specified",
    ).length,
    districtCount: districts.size,
    sectorCount: bySector.rows.filter((row) => row.name !== "Unclassified").length,
    themeCount: byTheme.rows.length,
    aspirationalSpend: round(aspirationalSpend),
    aspirationalShare: totalSpend > 0 ? aspirationalSpend / totalSpend : 0,
    complianceRate: complianceBase > 0 ? round((complianceMet / complianceBase) * 100) : null,
    complianceBase,
    complianceMet,
    complianceSparkline,
    districtSparkline,
    beneficiarySparkline,
    beneficiaries: beneficiaryTotal > 0 ? round(beneficiaryTotal) : null,
    top10Share: totalSpend > 0 ? top10 / totalSpend : 0,
    spendSparkline: sparkline(trend, (point) => point.spend),
    companySparkline: sparkline(trend, (point) => point.companies),
    projectSparkline: sparkline(trend, (point) => point.projects),
    avgSparkline: sparkline(trend, (point) => (point.companies ? round(point.spend / point.companies) : 0)),
  };

  return {
    kpis,
    trend,
    topCompanies: topN > 0 ? byCompany.rows.slice(0, topN) : byCompany.rows,
    bySector: bySector.rows,
    byState: byState.rows,
    byTheme: byTheme.rows,
    byMode: byMode.rows,
    byDistrict: byDistrict.rows.slice(0, 60),
    filteredRows: rows.length,
    generatedAt: data.generatedAt,
  };
}

// ---------------------------------------------------------------------------
// Project table
// ---------------------------------------------------------------------------

export function hydrateRow(row: number): ProjectRow {
  const data = getDataset();
  const company = data.companies[data.companyIdx[row]];
  const spent = data.spent[row];
  const outlay = data.outlay[row];
  const beneficiaries = data.beneficiaries[row];
  return {
    id: row,
    company: company?.name ?? "Unknown",
    companyId: company?.id ?? "",
    year: data.yearIdx[row] >= 0 ? data.years[data.yearIdx[row]] : "—",
    sector: data.sectors[data.sectorIdx[row]] ?? "Unclassified",
    state: data.states[data.stateIdx[row]] ?? "Not Specified",
    district: data.districtIdx[row] >= 0 ? data.districts[data.districtIdx[row]] : null,
    theme: data.themes[data.themeIdx[row]] ?? "Not Specified",
    mode: data.modes[data.modeIdx[row]] ?? "Not Specified",
    project: data.projects[row],
    outlay: Number.isNaN(outlay) ? null : round(outlay, 4),
    spent: Number.isNaN(spent) ? null : round(spent, 4),
    ngo: data.ngoIdx[row] >= 0 ? data.ngos[data.ngoIdx[row]] : null,
    beneficiaries: Number.isNaN(beneficiaries) ? null : beneficiaries,
    status: data.statusIdx[row] >= 0 ? data.statuses[data.statusIdx[row]] : null,
    aspirational: data.aspirational[row] === 1,
  };
}

function sortRows(rows: Int32Array, field: SortField, direction: SortDirection): Int32Array {
  const data = getDataset();
  const sign = direction === "asc" ? 1 : -1;
  const copy = Int32Array.from(rows);

  const numeric = (values: Float64Array) => (a: number, b: number) => {
    const va = values[a];
    const vb = values[b];
    if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
    if (Number.isNaN(va)) return 1; // rows with no disclosed amount sink
    if (Number.isNaN(vb)) return -1;
    return (va - vb) * sign;
  };

  const byLabel = (keys: Int32Array, dictionary: string[]) => (a: number, b: number) =>
    (dictionary[keys[a]] ?? "").localeCompare(dictionary[keys[b]] ?? "") * sign;

  const comparators: Record<SortField, (a: number, b: number) => number> = {
    spent: numeric(data.spent),
    outlay: numeric(data.outlay),
    year: byLabel(data.yearIdx, data.years),
    company: (a, b) =>
      (data.companies[data.companyIdx[a]]?.name ?? "").localeCompare(
        data.companies[data.companyIdx[b]]?.name ?? "",
      ) * sign,
    sector: byLabel(data.sectorIdx, data.sectors),
    state: byLabel(data.stateIdx, data.states),
    district: byLabel(data.districtIdx, data.districts),
    theme: byLabel(data.themeIdx, data.themes),
    mode: byLabel(data.modeIdx, data.modes),
  };

  return copy.sort(comparators[field] ?? comparators.spent);
}

export function buildProjects(
  filters: Filters,
  options: { page: number; pageSize: number; sort: SortField; direction: SortDirection },
): ProjectsResponse {
  const data = getDataset();
  const rows = sortRows(selectRows(filters), options.sort, options.direction);

  let totalSpendInView = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const value = data.spent[rows[i]];
    if (!Number.isNaN(value)) totalSpendInView += value;
  }

  const pageSize = Math.min(Math.max(options.pageSize, 5), 200);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(options.page, 1), pageCount);
  const start = (page - 1) * pageSize;

  return {
    rows: Array.from(rows.subarray(start, start + pageSize)).map(hydrateRow),
    total: rows.length,
    page,
    pageSize,
    pageCount,
    totalSpendInView: round(totalSpendInView),
  };
}

export function selectSortedRows(filters: Filters, sort: SortField, direction: SortDirection) {
  return sortRows(selectRows(filters), sort, direction);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export const CSV_HEADERS = [
  "Company", "CIN", "Financial Year", "Sector", "State", "District",
  "Thematic Area", "Mode of Implementation", "Aspirational District",
  "CSR Project", "Project Outlay (INR Cr)", "Amount Spent (INR Cr)",
];

export function csvCell(value: string | number | null | boolean): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowToCsvValues(row: ProjectRow, cin: string | null) {
  return [
    row.company, cin, row.year, row.sector, row.state, row.district,
    row.theme, row.mode, row.aspirational ? "Yes" : "No",
    row.project, row.outlay, row.spent,
  ];
}

export function buildCsv(
  filters: Filters,
  sort: SortField,
  direction: SortDirection,
  limit = 200_000,
): string {
  const data = getDataset();
  const rows = sortRows(selectRows(filters), sort, direction).subarray(0, limit);
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (let i = 0; i < rows.length; i += 1) {
    const row = hydrateRow(rows[i]);
    const cin = data.companies[data.companyIdx[rows[i]]]?.cin ?? "";
    lines.push(rowToCsvValues(row, cin).map(csvCell).join(","));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Company drill-down + comparison
// ---------------------------------------------------------------------------

function scopedFilters(companyIds: string[], base?: Partial<Filters>): Filters {
  return {
    years: base?.years ?? [],
    sectors: [],
    states: base?.states ?? [],
    districts: base?.districts ?? [],
    themes: base?.themes ?? [],
    companies: companyIds,
    modes: base?.modes ?? [],
    search: base?.search ?? "",
    minSpend: null,
    maxSpend: null,
    aspirationalOnly: false,
  };
}

/** National totals, computed once and memoised — used for ranks and shares. */
function nationalCompanyRanking(): NamedValue[] {
  const data = getDataset();
  const cacheKey = "__csrNationalRanking";
  const store = globalThis as unknown as Record<string, NamedValue[] | undefined>;
  if (!store[cacheKey]) {
    const all = new Int32Array(data.count);
    for (let i = 0; i < data.count; i += 1) all[i] = i;
    store[cacheKey] = groupBy(all, "company").rows;
  }
  return store[cacheKey]!;
}

export function buildCompanyDetail(companyId: string, base?: Partial<Filters>): CompanyDetail | null {
  const data = getDataset();
  const index = data.companyIdToIndex.get(companyId);
  if (index === undefined) return null;
  const company = data.companies[index];

  const filters = scopedFilters([companyId], base);
  const summary = buildSummary(filters, 0);
  const rows = selectRows(filters);

  const ranking = nationalCompanyRanking();
  const nationalTotal = ranking.reduce((sum, row) => sum + row.value, 0);
  const rank = ranking.findIndex((row) => row.id === companyId);
  const sectorRanking = ranking.filter(
    (row) => data.companies[data.companyIdToIndex.get(row.id ?? "") ?? -1]?.sector === company.sector,
  );
  const sectorRank = sectorRanking.findIndex((row) => row.id === companyId);

  const obligation = company.csrObligation ?? company.twoPercentNetProfit;
  const latestYearSpend = summary.kpis.latestYearSpend;
  const topProjects = Array.from(sortRows(rows, "spent", "desc").subarray(0, 25)).map(hydrateRow);

  return {
    company,
    kpis: {
      totalSpend: summary.kpis.totalSpend,
      latestYearSpend,
      projectCount: rows.length,
      stateCount: summary.kpis.stateCount,
      themeCount: summary.byTheme.length,
      yoyGrowthPct: summary.kpis.yoyGrowthPct,
      obligation: obligation ?? null,
      // The obligation is a single-year figure (2% of average net profit), so
      // it is compared against the latest year, not the multi-year total.
      utilisationPct: obligation && obligation > 0 ? round((latestYearSpend / obligation) * 100) : null,
      nationalRank: rank >= 0 ? rank + 1 : null,
      nationalShare: nationalTotal > 0 ? summary.kpis.totalSpend / nationalTotal : 0,
      sectorRank: sectorRank >= 0 ? sectorRank + 1 : null,
      aspirationalShare: summary.kpis.aspirationalShare,
    },
    trend: summary.trend,
    byTheme: summary.byTheme.slice(0, 10),
    byState: summary.byState.slice(0, 12),
    byMode: summary.byMode,
    topProjects,
    peers: sectorRanking.slice(0, 8),
  };
}

export function buildComparison(companyIds: string[], base?: Partial<Filters>): ComparisonResponse {
  const data = getDataset();
  const years = data.yearOrder.map((index) => data.years[index]);
  const companies: ComparisonRow[] = [];

  for (const id of companyIds.slice(0, 6)) {
    const index = data.companyIdToIndex.get(id);
    if (index === undefined) continue;
    const company = data.companies[index];
    const filters = scopedFilters([id], base);
    const rows = selectRows(filters);
    const summary = buildSummary(filters, 0);
    const obligation = company.csrObligation ?? company.twoPercentNetProfit;
    const byYear: Record<string, number> = {};
    for (const point of summary.trend) byYear[point.year] = point.spend;

    companies.push({
      id: company.id,
      name: company.name,
      sector: company.sector,
      totalSpend: summary.kpis.totalSpend,
      latestYearSpend: summary.kpis.latestYearSpend,
      projectCount: rows.length,
      stateCount: summary.kpis.stateCount,
      themeCount: summary.byTheme.length,
      yoyGrowthPct: summary.kpis.yoyGrowthPct,
      obligation: obligation ?? null,
      utilisationPct:
        obligation && obligation > 0 ? round((summary.kpis.latestYearSpend / obligation) * 100) : null,
      avgProjectSize: summary.kpis.avgProjectSize,
      topTheme: summary.byTheme[0]?.name ?? null,
      topState: summary.byState[0]?.name ?? null,
      byYear,
    });
  }

  return { companies, years };
}

export function listCompanies(): Company[] {
  return getDataset().companies;
}
