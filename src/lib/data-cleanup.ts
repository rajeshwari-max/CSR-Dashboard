/**
 * Load-time clean-up of the fact table.
 *
 * Applied every time the dataset is read, so it fixes the packaged seed, the
 * dataset already on a production disk and any later upload in one place,
 * without re-running the ETL:
 *
 *   1. Company name variants are merged ("Jindal Steel & Power" / "Jindal Steel
 *      And Power", "TCS" / "Tata Consultancy Services"). Old company ids keep
 *      resolving to the merged company, so saved links still work.
 *   2. CINs shared by unrelated companies (source data-entry errors) are dropped.
 *   3. Duplicate project lines are removed: exact repeats, and the same project
 *      filed under two Schedule VII heads with the full amount each time.
 *   4. Aspirational-district flags are recomputed against NITI Aayog's official
 *      list, matching state AND district (name-only matching wrongly flagged
 *      Aurangabad, Maharashtra).
 *   5. Each company gets an ownership class (Central PSU, State PSU, public sector
 *      bank or insurer, Private) from src/lib/reference/ownership.json.
 */
import aliasesJson from "@/lib/reference/company-aliases.json";
import aspirationalJson from "@/lib/reference/aspirational-districts.json";
import ownershipJson from "@/lib/reference/ownership.json";
import type { Company } from "@/types";

export const OWNERSHIP_CLASSES = ["Central PSU", "State PSU", "Public sector bank", "Public sector insurer", "Private"] as const;
export type Ownership = (typeof OWNERSHIP_CLASSES)[number];

const SUFFIXES = new Set(["private", "pvt", "public", "limited", "ltd", "llp", "inc", "incorporated", "corporation", "corp", "co", "company", "plc", "the", "and"]);

/** Spelling-insensitive key: "Dr. Reddy's Laboratories Ltd" and "Dr.Reddys Laboratories Limited" match. */
export function companyMatchKey(name: string): string {
  const base = name
    .toLowerCase()
    // Only drop parentheses that never distinguish a company: "(India)",
    // "(Transferred From Delhi…", "(Full Fledged Public Co)", "(formerly …)".
    // "Sagar Cements (R)" or "Tega Industries (Sez)" are separate filers.
    .replace(/\((india|transferred|full ?fledged|formerly)[^)]*\)?/g, " ")
    .replace(/[()]/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/limited/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !SUFFIXES.has(token))
    .join("");
  const aliases = aliasesJson as unknown as Record<string, string>;
  return aliases[base] ?? base;
}

const normDistrict = (value: string) => value.toLowerCase().replace(/district/g, "").replace(/[^a-z]/g, "");
const normState = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

const ASPIRATIONAL = new Set<string>();
for (const entry of (aspirationalJson as { districts: { state: string; district: string; aliases: string[] }[] }).districts) {
  for (const name of [entry.district, ...entry.aliases]) ASPIRATIONAL.add(`${normState(entry.state)}|${normDistrict(name)}`);
}
export const ASPIRATIONAL_POPULATION_SHARE = (aspirationalJson as { populationShare: number }).populationShare;
export const ASPIRATIONAL_DISTRICT_COUNT = (aspirationalJson as { districts: unknown[] }).districts.length;

export function isAspirationalDistrict(state: string, district: string): boolean {
  return ASPIRATIONAL.has(`${normState(state)}|${normDistrict(district)}`);
}

const OWNERSHIP = new Map<string, Ownership>();
for (const [klass, names] of Object.entries(ownershipJson as Record<string, unknown>)) {
  if (!Array.isArray(names)) continue;
  for (const name of names) OWNERSHIP.set(companyMatchKey(String(name)), klass as Ownership);
}
export const ownershipOf = (name: string): Ownership => OWNERSHIP.get(companyMatchKey(name)) ?? "Private";

type Row = [number, number, number, number, number, number, number, number | null, number | null, string | null, number, number | null, number, number, number];

export interface CleanupInput {
  dictionaries: { companies: Company[]; states: string[]; districts: string[] } & Record<string, unknown>;
  rows: Row[];
  stats: Record<string, number>;
}

export interface CleanupReport {
  companiesMerged: number;
  mergedNames: string[][];
  cinsCleared: number;
  duplicateRows: number;
  duplicateSpend: number;
  aspirationalAdded: number;
  aspirationalRemoved: number;
}

const hasValue = (value: unknown) => value !== null && value !== undefined && value !== "";

export function cleanDataset<T extends CleanupInput>(raw: T): { data: T; report: CleanupReport; aliasIndex: Map<string, number> } {
  const { companies, states, districts } = raw.dictionaries;

  // 1. merge companies by match key ------------------------------------------------
  const groupOf = new Map<string, number[]>();
  companies.forEach((company, index) => {
    const key = companyMatchKey(company.name);
    groupOf.set(key, [...(groupOf.get(key) ?? []), index]);
  });
  const newIndexOf = new Int32Array(companies.length);
  const merged: Company[] = [];
  const mergedNames: string[][] = [];
  const aliasIndex = new Map<string, number>();
  for (const members of groupOf.values()) {
    const target = merged.length;
    // Display the fullest spelling: "Tata Consultancy Services Limited" over "TCS".
    // Skip spellings with glued suffixes ("Hospitallimited") or broken brackets.
    const untidy = (name: string) => (/[a-z](limited|ltd)\b|\([^)]*$|transferred/i.test(name) ? 1 : 0);
    const lead = [...members].sort(
      (a, b) => untidy(companies[a].name) - untidy(companies[b].name) || companies[b].name.length - companies[a].name.length,
    )[0];
    const combined: Company = { ...companies[lead] };
    for (const index of members) {
      newIndexOf[index] = target;
      aliasIndex.set(companies[index].id, target);
      for (const [field, value] of Object.entries(companies[index])) {
        if (!hasValue((combined as unknown as Record<string, unknown>)[field]) && hasValue(value)) {
          (combined as unknown as Record<string, unknown>)[field] = value;
        }
      }
    }
    if (members.length > 1) mergedNames.push(members.map((index) => companies[index].name));
    combined.ownership = ownershipOf(combined.name);
    merged.push(combined);
  }

  // 2. clear CINs that several different companies claim ------------------------------
  const cinOwners = new Map<string, Set<number>>();
  merged.forEach((company, index) => {
    if (company.cin) cinOwners.set(company.cin, (cinOwners.get(company.cin) ?? new Set()).add(index));
  });
  let cinsCleared = 0;
  for (const company of merged) {
    if (company.cin && (cinOwners.get(company.cin)?.size ?? 0) > 1) { company.cin = null; cinsCleared += 1; }
  }

  // 3 + 4. remap rows, drop duplicates, recompute aspirational ---------------------------
  const exact = new Set<string>();
  const multiHead = new Set<string>();
  const rows: Row[] = [];
  let duplicateRows = 0;
  let duplicateSpend = 0;
  let aspirationalAdded = 0;
  let aspirationalRemoved = 0;
  for (const source of raw.rows) {
    const row = [...source] as Row;
    row[0] = newIndexOf[row[0]];
    const project = (row[9] ?? "").trim().toLowerCase().slice(0, 120);
    const exactKey = [row[0], row[1], project, row[3], row[6], row[7], row[8], row[4]].join("|");
    const spent = row[8];
    const headKey = [row[0], row[1], project, row[3], row[6], spent].join("|");
    const isMultiHead = Boolean(project) && typeof spent === "number" && spent > 0 && multiHead.has(headKey);
    if (exact.has(exactKey) || isMultiHead) {
      duplicateRows += 1;
      if (typeof spent === "number" && spent > 0) duplicateSpend += spent;
      continue;
    }
    exact.add(exactKey);
    if (project && typeof spent === "number" && spent > 0) multiHead.add(headKey);

    const state = states[row[3]] ?? "";
    const district = row[6] >= 0 ? districts[row[6]] ?? "" : "";
    const flag = district ? (isAspirationalDistrict(state, district) ? 1 : 0) : 0;
    if (flag && !row[14]) aspirationalAdded += 1;
    if (!flag && row[14]) aspirationalRemoved += 1;
    row[14] = flag;
    rows.push(row);
  }

  const report: CleanupReport = {
    companiesMerged: companies.length - merged.length,
    mergedNames,
    cinsCleared,
    duplicateRows,
    duplicateSpend: Math.round(duplicateSpend * 100) / 100,
    aspirationalAdded,
    aspirationalRemoved,
  };
  const data = {
    ...raw,
    dictionaries: { ...raw.dictionaries, companies: merged },
    rows,
    stats: { ...raw.stats, load_companies_merged: report.companiesMerged, load_duplicate_rows: duplicateRows, load_cins_cleared: cinsCleared },
  };
  return { data, report, aliasIndex };
}

// ---------------------------------------------------------------------------
// Focus tags read from project names: the Schedule VII head alone cannot tell
// disaster risk reduction from relief, or disability work inside "special education".
// ---------------------------------------------------------------------------

export const FOCUS_TAGS = [
  {
    id: "disaster-relief",
    label: "Disaster relief and response (incl. COVID-19)",
    pattern: /\b(relief|covid|corona|pandemic|pm[\s-]?cares|chief minister'?s? (relief|distress)|cm relief|flood (victims|affected)|cyclone (victims|affected)|rehabilitation of (flood|cyclone|earthquake)|disaster (relief|response))/i,
  },
  {
    id: "disaster-risk-reduction",
    label: "Disaster risk reduction and preparedness",
    pattern: /\b(disaster (risk|preparedness|resilien|mitigation|management)|risk reduction|early warning|cyclone shelter|flood (protection|control|resilien|preparedness)|climate resilien|resilient (village|communit|infrastructure)|preparedness)/i,
  },
  {
    id: "disability",
    label: "Disability inclusion",
    pattern: /\b(disab|divyang|differently[\s-]?abled|specially[\s-]?abled|handicap|blind|visual(ly)?[\s-]impair|hearing[\s-]impair|deaf|autis|cerebral palsy|wheel ?chair|prosthe|artificial limb|assistive|special needs|intellectual(ly)? (challenged|disab)|pwd)/i,
  },
] as const;

export function focusBits(text: string): number {
  let bits = 0;
  FOCUS_TAGS.forEach((tag, index) => { if (tag.pattern.test(text)) bits |= 1 << index; });
  return bits;
}
