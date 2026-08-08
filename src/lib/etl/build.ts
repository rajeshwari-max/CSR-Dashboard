/**
 * In-app ETL: turns an uploaded CSV/XLSX into the dictionary-encoded dataset
 * the query engine reads. Same rules as scripts/etl.py, so an upload and a CLI
 * run produce the same numbers.
 */

import {
  CORE_COLUMNS,
  NOT_SPECIFIED,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  cleanText,
  companyKey,
  displayName,
  normaliseMode,
  normaliseSector,
  normaliseState,
  normaliseTheme,
  normaliseYear,
  resolveColumns,
  titleCase,
  toAmount,
  toInt,
} from "@/lib/etl/vocab";
import type { Capabilities, Company, ColumnCoverage } from "@/types";

export interface SourceTable {
  /** Sheet or file name, used for year fallback and provenance. */
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface BuildStats {
  workbooks: number;
  raw_rows: number;
  dropped_no_company: number;
  dropped_empty: number;
  duplicates_removed: number;
  missing_year: number;
  missing_spend: number;
  sector_backfilled: number;
  sector_unknown: number;
  negative_amounts: number;
  aspirational_rows: number;
}

export type FactRow = [
  number, number, number, number, number, number, number,
  number | null, number | null, string | null,
  number, number | null, number, number, number,
];

export interface BuiltDataset {
  generatedAt: string;
  sources: { file: string; sheets: string[] }[];
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
  rows: FactRow[];
  stats: BuildStats;
}

export function isFactTable(headers: string[]): boolean {
  const resolved = resolveColumns(headers, REQUIRED_COLUMNS);
  return Object.keys(REQUIRED_COLUMNS).every((key) => resolved[key] !== null);
}

const EMPTY_STATS: BuildStats = {
  workbooks: 0, raw_rows: 0, dropped_no_company: 0, dropped_empty: 0,
  duplicates_removed: 0, missing_year: 0, missing_spend: 0, sector_backfilled: 0,
  sector_unknown: 0, negative_amounts: 0, aspirational_rows: 0,
};

interface BuilderState {
  companies: Map<string, Company & { index: number }>;
  tables: Record<string, Map<string, number>>;
  rows: FactRow[];
  seen: Set<string>;
  stats: BuildStats;
  columnPresent: Record<string, boolean>;
  columnFilled: Record<string, number>;
  sources: { file: string; sheets: string[] }[];
}

function newState(): BuilderState {
  const tableNames = ["years", "sectors", "states", "themes", "modes", "districts", "ngos", "statuses", "sdgs"];
  return {
    companies: new Map(),
    tables: Object.fromEntries(tableNames.map((name) => [name, new Map<string, number>()])),
    rows: [],
    seen: new Set(),
    stats: { ...EMPTY_STATS },
    columnPresent: Object.fromEntries(Object.keys(OPTIONAL_COLUMNS).map((key) => [key, false])),
    columnFilled: Object.fromEntries(Object.keys(OPTIONAL_COLUMNS).map((key) => [key, 0])),
    sources: [],
  };
}

/** Rehydrate an existing dataset so "merge" can add to it. */
function stateFromExisting(existing: BuiltDataset): BuilderState {
  const state = newState();
  state.sources = [...existing.sources];
  state.stats = { ...existing.stats };

  existing.dictionaries.companies.forEach((company, index) => {
    state.companies.set(company.id, { ...company, index });
  });
  const load = (name: keyof BuiltDataset["dictionaries"], target: string) => {
    (existing.dictionaries[name] as string[]).forEach((value, index) =>
      state.tables[target].set(value, index),
    );
  };
  load("years", "years"); load("sectors", "sectors"); load("states", "states");
  load("themes", "themes"); load("modes", "modes"); load("districts", "districts");
  load("ngos", "ngos"); load("statuses", "statuses"); load("sdgs", "sdgs");

  state.rows = [...existing.rows];
  for (const row of existing.rows) {
    state.seen.add(fingerprint(row, existing));
  }
  for (const [key, coverage] of Object.entries(existing.columnCoverage ?? {})) {
    state.columnPresent[key] = coverage.present;
    state.columnFilled[key] = coverage.filled;
  }
  return state;
}

function fingerprint(row: FactRow, dataset: BuiltDataset): string {
  const year = row[1] >= 0 ? dataset.dictionaries.years[row[1]] : "";
  const state = dataset.dictionaries.states[row[3]] ?? "";
  const district = row[6] >= 0 ? dataset.dictionaries.districts[row[6]] : "";
  const theme = dataset.dictionaries.themes[row[4]] ?? "";
  return [row[0], year, (row[9] ?? "").toLowerCase().slice(0, 120), state, district.toLowerCase(), row[7], row[8], theme].join("|");
}

function intern(state: BuilderState, table: string, value: string): number {
  const store = state.tables[table];
  const existing = store.get(value);
  if (existing !== undefined) return existing;
  const index = store.size;
  store.set(value, index);
  return index;
}

function tableList(state: BuilderState, name: string): string[] {
  const entries = [...state.tables[name].entries()].sort((a, b) => a[1] - b[1]);
  return entries.map(([value]) => value);
}

export interface BuildOptions {
  fileName: string;
  /** Existing dataset to merge into; omit for a full replace. */
  existing?: BuiltDataset | null;
  /** Districts flagged as aspirational (lower-cased). */
  aspirational?: Set<string>;
  /** company key -> sector, used to backfill a missing sector column. */
  sectorLookup?: Map<string, string>;
}

export function buildDataset(tables: SourceTable[], options: BuildOptions): BuiltDataset {
  const state = options.existing ? stateFromExisting(options.existing) : newState();
  const aspirational = options.aspirational ?? new Set<string>();
  const sectorLookup = options.sectorLookup ?? new Map<string, string>();
  const ingestedSheets: string[] = [];

  for (const table of tables) {
    if (!isFactTable(table.headers)) continue;
    ingestedSheets.push(table.name);
    state.stats.raw_rows += table.rows.length;

    const core = resolveColumns(table.headers, { ...CORE_COLUMNS, ...REQUIRED_COLUMNS });
    const optional = resolveColumns(table.headers, OPTIONAL_COLUMNS);
    for (const [key, column] of Object.entries(optional)) {
      if (column !== null) state.columnPresent[key] = true;
    }
    const sheetYear = normaliseYear(table.name);

    const cell = (record: Record<string, unknown>, key: string) => {
      const column = core[key] ?? optional[key];
      return column === null || column === undefined ? null : record[column];
    };

    for (const record of table.rows) {
      const name = cleanText(cell(record, "company"));
      if (!name || (name.match(/[A-Za-z]/g) ?? []).length < 3) {
        state.stats.dropped_no_company += 1;
        continue;
      }

      const spent = toAmount(cell(record, "spent"));
      const outlay = toAmount(cell(record, "outlay"));
      const project = cleanText(cell(record, "project"));
      if (spent === null && outlay === null && project === null) {
        state.stats.dropped_empty += 1;
        continue;
      }

      const rawSpent = cell(record, "spent");
      if (typeof rawSpent === "number" && rawSpent < 0) state.stats.negative_amounts += 1;
      if (spent === null) state.stats.missing_spend += 1;

      const year = normaliseYear(cell(record, "year")) ?? sheetYear;
      if (year === null) state.stats.missing_year += 1;

      const id = companyKey(name);
      let cin = cleanText(cell(record, "cin"));
      if (cin && !/^[A-Za-z0-9]{15,25}$/.test(cin)) cin = null;

      let sector = normaliseSector(cell(record, "sector"));
      if (!sector) {
        sector = sectorLookup.get(id) ?? null;
        if (sector) state.stats.sector_backfilled += 1;
      }
      if (!sector) {
        sector = "Unclassified";
        state.stats.sector_unknown += 1;
      }

      let entry = state.companies.get(id);
      if (!entry) {
        entry = {
          id, name: displayName(name), cin, sector, index: state.companies.size,
          csrObligation: null, twoPercentNetProfit: null, averageNetProfit: null,
          totalOutlay: null, reportedSpend: null, policyUrl: null, annualReportUrl: null,
          brsrReportUrl: null, csrReportUrl: null, esgReportUrl: null, contactName: null,
          contactEmail: null, contactPhone: null, listed: null, companyType: null,
        };
        state.companies.set(id, entry);
      } else {
        if (entry.sector === "Unclassified" && sector !== "Unclassified") entry.sector = sector;
        if (!entry.cin && cin) entry.cin = cin;
        const candidate = displayName(name);
        if (candidate.length > entry.name.length) entry.name = candidate;
      }

      const attribute = (field: keyof Company, key: string, caster: (value: unknown) => unknown) => {
        if (entry![field] === null) {
          const value = caster(cell(record, key));
          if (value !== null && value !== undefined) {
            (entry as unknown as Record<string, unknown>)[field] = value;
          }
        }
      };
      attribute("csrObligation", "obligation", toAmount);
      attribute("twoPercentNetProfit", "two_pct", toAmount);
      attribute("averageNetProfit", "avg_profit", toAmount);
      attribute("totalOutlay", "co_outlay", toAmount);
      attribute("reportedSpend", "co_spent", toAmount);
      attribute("policyUrl", "policy", cleanText);
      attribute("annualReportUrl", "annual_report", cleanText);
      attribute("brsrReportUrl", "brsr_report", cleanText);
      attribute("csrReportUrl", "csr_report", cleanText);
      attribute("esgReportUrl", "esg_report", cleanText);
      attribute("contactName", "head", cleanText);
      attribute("contactEmail", "email", cleanText);
      attribute("contactPhone", "phone", cleanText);
      attribute("listed", "listed", cleanText);
      attribute("companyType", "company_type", cleanText);

      const stateName = normaliseState(cell(record, "state"));
      const district = titleCase(cleanText(cell(record, "district")));
      const theme = normaliseTheme(cell(record, "theme"));
      const mode = normaliseMode(cell(record, "mode"));

      const key = [
        entry.index, year ?? "", (project ?? "").toLowerCase().slice(0, 120),
        stateName, (district ?? "").toLowerCase(), outlay, spent, theme,
      ].join("|");
      if (state.seen.has(key)) {
        state.stats.duplicates_removed += 1;
        continue;
      }
      state.seen.add(key);

      const isAspirational = Boolean(district && aspirational.has(district.toLowerCase()));
      if (isAspirational) state.stats.aspirational_rows += 1;

      const ngo = cleanText(cell(record, "ngo"));
      const status = cleanText(cell(record, "status"));
      const sdg = cleanText(cell(record, "sdg"));
      const beneficiaries = toInt(cell(record, "beneficiaries"));
      const counted: [string, unknown][] = [
        ["ngo", ngo], ["status", status], ["sdg", sdg], ["beneficiaries", beneficiaries],
        ["start_date", cleanText(cell(record, "start_date"))],
        ["end_date", cleanText(cell(record, "end_date"))],
        ["duration", cleanText(cell(record, "duration"))],
      ];
      for (const [field, value] of counted) {
        if (value !== null && value !== undefined) state.columnFilled[field] += 1;
      }

      state.rows.push([
        entry.index,
        year ? intern(state, "years", year) : -1,
        intern(state, "sectors", sector),
        intern(state, "states", stateName),
        intern(state, "themes", theme),
        intern(state, "modes", mode),
        district ? intern(state, "districts", district) : -1,
        outlay,
        spent,
        project,
        ngo ? intern(state, "ngos", ngo) : -1,
        beneficiaries,
        status ? intern(state, "statuses", status) : -1,
        sdg ? intern(state, "sdgs", sdg) : -1,
        isAspirational ? 1 : 0,
      ]);
    }
  }

  state.sources.push({ file: options.fileName, sheets: ingestedSheets });
  state.stats.workbooks = state.sources.length;

  // A column only counts as "available" once it is meaningfully populated.
  const minRows = Math.max(25, Math.floor(state.rows.length * 0.01));
  const capabilities = Object.fromEntries(
    Object.keys(OPTIONAL_COLUMNS).map((key) => [
      key,
      Boolean(state.columnPresent[key] && state.columnFilled[key] >= minRows),
    ]),
  ) as unknown as Capabilities;

  const columnCoverage = Object.fromEntries(
    Object.keys(OPTIONAL_COLUMNS).map((key) => [
      key,
      {
        present: state.columnPresent[key],
        filled: state.columnFilled[key],
        coveragePct: state.rows.length
          ? Math.round((10_000 * state.columnFilled[key]) / state.rows.length) / 100
          : 0,
        available: Boolean(state.columnPresent[key] && state.columnFilled[key] >= minRows),
      },
    ]),
  );

  const companies = [...state.companies.values()]
    .sort((a, b) => a.index - b.index)
    .map(({ index: _index, ...company }) => company as Company);

  return {
    generatedAt: new Date().toISOString(),
    sources: state.sources,
    currency: "INR Crore",
    schema: [
      "companyIdx", "yearIdx", "sectorIdx", "stateIdx", "themeIdx", "modeIdx",
      "districtIdx", "outlay", "spent", "project", "ngoIdx", "beneficiaries",
      "statusIdx", "sdgIdx", "aspirational",
    ],
    capabilities,
    columnCoverage,
    dictionaries: {
      companies,
      years: tableList(state, "years"),
      sectors: tableList(state, "sectors"),
      states: tableList(state, "states"),
      themes: tableList(state, "themes"),
      modes: tableList(state, "modes"),
      districts: tableList(state, "districts"),
      ngos: tableList(state, "ngos"),
      statuses: tableList(state, "statuses"),
      sdgs: tableList(state, "sdgs"),
    },
    rows: state.rows,
    stats: state.stats,
  };
}

/** meta.json companion — the small payload the browser is allowed to fetch. */
export function buildMeta(dataset: BuiltDataset) {
  const byYear: Record<string, number> = {};
  let totalSpend = 0;
  for (const row of dataset.rows) {
    const spent = row[8] ?? 0;
    totalSpend += spent;
    if (row[1] >= 0) {
      const year = dataset.dictionaries.years[row[1]];
      byYear[year] = (byYear[year] ?? 0) + spent;
    }
  }
  const sorted = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b));

  return {
    generatedAt: dataset.generatedAt,
    sources: dataset.sources,
    currency: dataset.currency,
    capabilities: dataset.capabilities,
    columnCoverage: dataset.columnCoverage,
    rowCount: dataset.rows.length,
    companyCount: dataset.dictionaries.companies.length,
    totalSpend: Math.round(totalSpend * 100) / 100,
    years: sorted(dataset.dictionaries.years),
    sectors: sorted(dataset.dictionaries.sectors),
    states: sorted(dataset.dictionaries.states),
    themes: sorted(dataset.dictionaries.themes),
    modes: sorted(dataset.dictionaries.modes),
    districts: sorted(dataset.dictionaries.districts),
    ngos: sorted(dataset.dictionaries.ngos),
    statuses: sorted(dataset.dictionaries.statuses),
    companies: dataset.dictionaries.companies
      .map((company) => ({ id: company.id, name: company.name, sector: company.sector }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    spendByYear: Object.fromEntries(
      Object.entries(byYear).sort().map(([year, value]) => [year, Math.round(value * 100) / 100]),
    ),
    stats: dataset.stats,
  };
}
