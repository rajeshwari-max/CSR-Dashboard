/**
 * Natural-language query engine — no LLM, no API key, no subscription.
 *
 * Questions about this dashboard are drawn from a small, closed world:
 * a dimension (state / sector / company / category / district / mode),
 * a metric (spend / growth / projects / companies), a direction (most /
 * least), and optionally a financial year or a named entity. That is narrow
 * enough to parse directly, which has three advantages over a model: it
 * answers in about a millisecond, it costs nothing, and every figure it
 * quotes is computed from the fact table rather than generated — so it
 * cannot invent one.
 *
 * When a question falls outside what it can parse, it says so and lists what
 * it does understand, rather than guessing.
 */

import aliasesJson from "@/lib/reference/company-aliases.json";
import { companyMatchKey } from "@/lib/data-cleanup";
import { buildSummary, getDataset, groupBy, round, selectRows } from "@/lib/dataset";
import { displayCompanyName } from "@/lib/format";
import { EMPTY_FILTERS, type Dimension, type Filters, type NamedValue } from "@/types";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const INR0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function crore(value: number): string {
  return Math.abs(value) >= 1000 ? `₹${INR0.format(value)} Cr` : `₹${INR.format(value)} Cr`;
}
function pct(value: number | null): string {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
function count(value: number): string {
  return INR0.format(value);
}

export interface NlqAnswer {
  answer: string;
  /** Structured evidence for the numbers quoted in `answer`. */
  facts: Record<string, unknown>;
  /** False when the question could not be parsed. */
  understood: boolean;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type Metric = "spend" | "growth" | "projects" | "companies";
type Direction = "top" | "bottom";

const DIMENSION_WORDS: [RegExp, Dimension][] = [
  [/\b(state|states|region|regions|geograph)/i, "state"],
  [/\b(district|districts)\b/i, "district"],
  [/\b(sector|sectors|industry|industries)\b/i, "sector"],
  [/\b(compan|firm|filer|corporate)/i, "company"],
  [/\b(categor|theme|thematic|schedule\s*vii|cause)/i, "theme"],
  [/\b(mode|implementation|delivery|agenc|trust)/i, "mode"],
  [/\b(year|yearly|annual|fy)\b/i, "year"],
];

const METRIC_WORDS: [RegExp, Metric][] = [
  [/\b(growth|grew|growing|gain|gained|rise|rose|rising|increase|increased|declin|fell|fall|falling|drop|dropped|shrink|shrank|reduced|reducing|decreas|cut)/i, "growth"],
  [/\b(project|projects|initiative|initiatives)\b/i, "projects"],
  [/\b(compan|firm|filer)/i, "companies"],
  [/\b(spend|spent|spending|amount|money|funding|funded|invest|contribut|allocat|csr)/i, "spend"],
];

/** Minimum prior-year spend (INR Cr) before a growth rate is worth ranking. */
const MIN_GROWTH_BASE = 25;

const BOTTOM_WORDS = /\b(least|lowest|smallest|bottom|worst|minimum|fewest)\b/i;
/** Words that ask for the biggest fall even when they say "most". */
const DECLINE_WORDS = /\b(declin\w*|fell|fall\w*|drop\w*|shr[ai]nk\w*|decreas\w*|reduced|reducing|cut)\b/i;
const TOP_WORDS = /\b(most|highest|largest|biggest|top|leading|best|maximum|greatest)\b/i;

/** "FY 2022-23", "2022-23", "FY23", "latest", "last year" */
function parseYear(question: string, years: string[]): string | null {
  const sorted = [...years].sort();
  if (/\b(latest|last|recent|current|newest)\b/i.test(question)) {
    return sorted[sorted.length - 1] ?? null;
  }
  if (/\b(first|earliest|oldest)\b/i.test(question)) return sorted[0] ?? null;

  const explicit = /(\d{4})\s*[-–/]\s*(\d{2,4})/.exec(question);
  if (explicit) {
    const wanted = `${explicit[1]}-${explicit[2].slice(-2)}`;
    const match = years.find((year) => year.includes(wanted));
    if (match) return match;
  }
  const single = /\bfy\s?(\d{2,4})\b/i.exec(question);
  if (single) {
    const needle = single[1].slice(-2);
    const match = years.find((year) => year.endsWith(`-${needle}`) || year.includes(needle));
    if (match) return match;
  }
  return null;
}

/** Longest-match entity lookup against a vocabulary. */
function findEntity(question: string, vocabulary: string[]): string | null {
  const lower = question.toLowerCase();
  let best: string | null = null;
  for (const value of vocabulary) {
    const name = value.toLowerCase();
    if (name.length < 4) continue; // avoid matching "food" inside "seafood" etc.
    if (lower.includes(name) && (!best || name.length > best.length)) best = value;
  }
  return best;
}

function detect<T>(question: string, table: [RegExp, T][]): T | null {
  for (const [pattern, value] of table) if (pattern.test(question)) return value;
  return null;
}


// ---------------------------------------------------------------------------
// Company names
// ---------------------------------------------------------------------------
//
// People ask about "ITC", "Siemens" or "Infosys Foundation", not "ITC Limited"
// or "Siemens Limited". Each company gets short forms with the legal suffixes
// (and a trailing "India") removed, matched on whole words.

const LEGAL_WORDS = new Set([
  "limited", "ltd", "pvt", "private", "public", "company", "co", "corporation", "corp", "inc", "plc", "llp", "the",
]);

/** Single words too generic to identify a company on their own. */
const GENERIC_NAMES = new Set([
  "india", "indian", "bharat", "national", "state", "bank", "power", "energy", "health", "education", "rural",
  "development", "industries", "industry", "finance", "capital", "services", "global", "international", "group",
  "steel", "cement", "cements", "infra", "projects", "foundation", "trust", "general", "united", "standard",
  "healthcare", "health care", "hospital", "hospitals", "pharma", "foods", "motors", "textiles", "chemicals", "agro",
  "logistics", "solar", "auto", "technologies", "systems", "software", "retail", "housing", "insurance", "water",
  "sports", "education", "skills", "environment", "women", "rural", "animal", "culture",
]);

/** Everyday words for Schedule VII categories. */
const THEME_SYNONYMS: [RegExp, string][] = [
  [/\b(health\s?care|health|healthcare|medical|hospitals?)\b/i, "Health Care"],
  [/\b(education|schools?|learning)\b/i, "Education"],
  [/\b(hunger|nutrition|malnutrition|poverty|food security)\b/i, "Poverty, Eradicating Hunger, Malnutrition"],
  [/\b(environment|environmental|climate|green)\b/i, "Environmental Sustainability"],
  [/\b(livelihoods?)\b/i, "Livelihood Enhancement Projects"],
  [/\b(rural development|rural)\b/i, "Rural Development Projects"],
  [/\b(drinking water|water)\b/i, "Safe Drinking Water"],
  [/\b(sports?)\b/i, "Training To Promote Sports"],
  [/\b(sanitation|toilets?)\b/i, "Sanitation"],
  [/\b(skills?|skilling|vocational)\b/i, "Vocational Skills"],
  [/\b(women|woman)\b/i, "Women Empowerment"],
  [/\b(gender)\b/i, "Gender Equality"],
  [/\b(elderly|senior citizens?|old age)\b/i, "Senior Citizens Welfare"],
  [/\b(animals?)\b/i, "Animal Welfare"],
  [/\b(art|culture|heritage)\b/i, "Art And Culture"],
  [/\b(veterans?|armed forces|war widows)\b/i, "Armed Forces, Veterans, War Widows/ Dependants"],
  [/\b(slums?)\b/i, "Slum Area Development"],
  [/\b(orphans?|orphanages?)\b/i, "Setting Up Orphanage"],
];

/** Every Schedule VII category a question names, in the order they appear. */
function findThemes(question: string, themes: string[]): string[] {
  const found: { name: string; at: number }[] = [];
  const lower = question.toLowerCase();
  for (const theme of themes) {
    const at = theme.length >= 4 ? lower.indexOf(theme.toLowerCase()) : -1;
    if (at >= 0) found.push({ name: theme, at });
  }
  for (const [pattern, theme] of THEME_SYNONYMS) {
    const match = pattern.exec(question);
    if (match && themes.includes(theme) && !found.some((item) => item.name === theme)) found.push({ name: theme, at: match.index });
  }
  return found.sort((a, b) => a.at - b.at).map((item) => item.name);
}

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

interface CompanyName {
  index: number;
  forms: string[];
  words: number;
}

let nameIndex: {
  generatedAt: string;
  names: CompanyName[];
  byKey: Map<string, number>;
  /** First word -> companies starting with it, largest spender first ("reliance", "tata"). */
  groups: Map<string, number[]>;
} | null = null;

function companyNames() {
  const data = getDataset();
  if (nameIndex?.generatedAt === data.generatedAt) return nameIndex;
  const reserved = new Set(
    [...data.states, ...data.sectors, ...data.themes].map((value) => normalise(value).trim()),
  );
  const names: CompanyName[] = [];
  const byKey = new Map<string, number>();
  data.companies.forEach((company, index) => {
    byKey.set(companyMatchKey(company.name), index);
    const words = normalise(company.name).trim().split(" ").filter((word) => word && !LEGAL_WORDS.has(word));
    const forms = new Set<string>();
    const core = words.join(" ");
    forms.add(core);
    if (words.length > 1 && words[words.length - 1] === "india") forms.add(words.slice(0, -1).join(" "));
    // "Adani Green" for Adani Green Energy: the first two words of a longer name.
    if (words.length >= 3) forms.add(words.slice(0, 2).join(" "));
    const usable = [...forms].filter(
      (form) => form.length >= 3 && !reserved.has(form) && !(GENERIC_NAMES.has(form) && !form.includes(" ")),
    );
    if (usable.length) names.push({ index, forms: usable, words: words.length });
  });
  const spend = new Map<number, number>();
  for (const row of groupBy(selectRows(EMPTY_FILTERS), "company").rows) {
    const index = data.companyIdToIndex.get(row.id ?? "");
    if (index !== undefined) spend.set(index, row.value);
  }
  const groups = new Map<string, number[]>();
  for (const name of names) {
    const first = normalise(data.companies[name.index].name).trim().split(" ")[0];
    if (first.length < 4 || GENERIC_NAMES.has(first) || QUESTION_WORDS.has(first) || reserved.has(first)) continue;
    groups.set(first, [...(groups.get(first) ?? []), name.index]);
  }
  // Acronyms people use for long names: ONGC, SBI, LIC, BPCL, NTPC.
  for (const name of names) {
    const all = normalise(data.companies[name.index].name).trim().split(" ").filter((word) => !/^(and|of|the|for)$/.test(word));
    const variants = new Set<string>();
    const strip = (words: string[], drop: RegExp) => words.filter((word) => !drop.test(word));
    for (const words of [all, strip(all, /^(limited|ltd)$/), strip(all, /^(limited|ltd|india)$/), strip(all, /^(limited|ltd|pvt|private)$/)]) {
      if (words.length >= 3) variants.add(words.map((word) => word[0]).join(""));
    }
    for (const acronym of variants) {
      if (acronym.length < 3 || QUESTION_WORDS.has(acronym) || reserved.has(acronym) || GENERIC_NAMES.has(acronym)) continue;
      const list = groups.get(acronym) ?? [];
      if (!list.includes(name.index)) groups.set(acronym, [...list, name.index]);
    }
  }
  for (const list of groups.values()) list.sort((a, b) => (spend.get(b) ?? 0) - (spend.get(a) ?? 0));
  nameIndex = { generatedAt: data.generatedAt, names, byKey, groups };
  return nameIndex;
}

/** The company a question names, by short form, full name or a known alias. */
export function findCompany(question: string): { index: number; matched: string; others: number[] } | null {
  const text = normalise(question);
  const { names, byKey, groups } = companyNames();
  let best: { index: number; matched: string; score: number } | null = null;
  for (const name of names) {
    for (const form of name.forms) {
      if (!text.includes(` ${form} `)) continue;
      // Longer matches win; on a tie prefer the company whose whole name it is
      // ("Siemens" -> Siemens Limited, not Siemens Healthcare).
      const score = form.length * 10 - name.words;
      if (!best || score > best.score) best = { index: name.index, matched: form, score };
    }
  }
  for (const [alias, key] of Object.entries(aliasesJson as Record<string, string>)) {
    if (alias.startsWith("_") || !text.includes(` ${alias} `)) continue;
    const index = byKey.get(key);
    if (index !== undefined && (!best || alias.length * 10 > best.score)) best = { index, matched: alias, score: alias.length * 10 };
  }
  if (best) return { index: best.index, matched: best.matched, others: [] };
  // Only a group name ("Reliance", "Tata"): take its largest CSR spender and
  // say which other companies share the name.
  for (const [word, list] of groups) {
    if (!text.includes(` ${word} `)) continue;
    // "acme widgets" is a different company from Acme Solar: only take the
    // group match when nothing else in the question is unexplained.
    const leftover = unknownWords(text.replace(` ${word} `, " ")).filter((other) => !isPlaceOrTopicWord(other));
    if (leftover.length) continue;
    return { index: list[0], matched: word, others: list.slice(1, 4) };
  }
  return null;
}

/** Up to three companies whose names start like the given word. */
function similarCompanies(word: string): string[] {
  const data = getDataset();
  const { names } = companyNames();
  const hits: string[] = [];
  for (const name of names) {
    const stem = word.slice(0, 5);
    if (word.length >= 4 && name.forms.some((form) => form.split(" ").some((part) => part === word || (stem.length === 5 && part.startsWith(stem))))) {
      hits.push(data.companies[name.index].name);
      if (hits.length >= 3) break;
    }
  }
  return hits;
}

/** Words that carry no entity: question words, metrics, generic CSR terms. */
const QUESTION_WORDS = new Set(
  (
    "what where which who whom how why when does do did is are was were be been the a an in on of for to by and or " +
    "with from into across about their its it this that these those much many most least more less top bottom " +
    "highest lowest largest smallest biggest best worst show tell me give list find get see csr spend spent spending " +
    "spends invest invests invested investment investments investing amount amounts money funding funded fund funds " +
    "contribute contributed contribution contributions allocate allocated total overall sum altogether all company " +
    "companies project projects state states district districts sector sectors category categories theme themes year " +
    "years yearly annual fy latest last recent current india indian crore cr rs inr rupees please trend trends over " +
    "time growth grew yoy compare vs versus between per average median work works working activities activity " +
    "programme programmes program programs initiatives initiative social responsibility corporate there any our we i"
  ).split(" "),
);

let topicWords: { generatedAt: string; words: Set<string> } | null = null;

/** True for words of a state, sector or category name, or a category synonym. */
function isPlaceOrTopicWord(word: string): boolean {
  const data = getDataset();
  if (topicWords?.generatedAt !== data.generatedAt) {
    const words = new Set<string>();
    for (const value of [...data.states, ...data.sectors, ...data.themes]) {
      for (const part of normalise(value).trim().split(" ")) if (part.length >= 3) words.add(part);
    }
    topicWords = { generatedAt: data.generatedAt, words };
  }
  return topicWords.words.has(word) || THEME_SYNONYMS.some(([pattern]) => pattern.test(word));
}

function unknownWords(question: string): string[] {
  return normalise(question)
    .trim()
    .split(" ")
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !QUESTION_WORDS.has(word));
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

const LABEL: Record<Dimension, string> = {
  state: "state", district: "district", sector: "sector",
  company: "company", theme: "category", mode: "implementation mode", year: "year", ownership: "ownership",
};
const PLURAL: Record<Dimension, string> = {
  state: "states", district: "districts", sector: "sectors",
  company: "companies", theme: "categories", mode: "implementation modes", year: "years", ownership: "ownership types",
};

export function answerQuestion(question: string, filters: Filters): NlqAnswer {
  const data = getDataset();
  const years = data.yearOrder.map((index) => data.years[index]);
  const base: Filters = { ...EMPTY_FILTERS, ...filters };

  const year = parseYear(question, years);
  const dimension = detect(question, DIMENSION_WORDS);
  let metric = detect(question, METRIC_WORDS) ?? "spend";
  const direction: Direction =
    DECLINE_WORDS.test(question) || (BOTTOM_WORDS.test(question) && !TOP_WORDS.test(question)) ? "bottom" : "top";

  // "Which companies spend most" ranks companies by spend, not by company count.
  if (dimension === "company" && metric === "companies") metric = "spend";

  // Entity mentioned by name? Scope the answer to it.
  const companyMatch = findCompany(question);
  const namedCompany = companyMatch ? data.companies[companyMatch.index] : undefined;
  // Words inside a company's name ("Adani Green", "Gujarat Gas") are not a
  // category or a state, so look for those in the rest of the question.
  const rest = companyMatch ? normalise(question).replace(` ${companyMatch.matched} `, " ") : question;
  const namedState = findEntity(rest, data.states);
  const namedSector = findEntity(rest, data.sectors);
  const themesNamed = findThemes(rest, data.themes);
  const namedTheme = themesNamed[0] ?? null;

  const scoped: Filters = {
    ...base,
    years: year ? [year] : base.years,
    states: namedState ? [namedState] : base.states,
    sectors: namedSector ? [namedSector] : base.sectors,
    themes: namedTheme ? [namedTheme] : base.themes,
    companies: namedCompany ? [namedCompany.id] : base.companies,
  };

  const namedParts = [
    namedCompany ? displayCompanyName(namedCompany.name) : null, namedTheme, namedSector,
  ].filter(Boolean) as string[];
  const named = namedParts.length || namedState
    ? `${namedParts.join(", ")}${namedState ? `${namedParts.length ? " in " : ""}${namedState}` : ""}`
    : null;

  // ---- two categories compared: "is education growing faster than health?"
  if (themesNamed.length >= 2 && /\b(faster|slower|than|compare|compared|vs|versus|between)\b/i.test(question)) {
    const series = themesNamed.slice(0, 3).map((theme) => {
      const trend = buildSummary({ ...base, themes: [theme], years: [] }, 0).trend;
      const first = trend[0];
      const last = trend[trend.length - 1];
      const prior = trend[trend.length - 2];
      const change = first && last && first.spend > 0 ? ((last.spend - first.spend) / first.spend) * 100 : null;
      const yoy = prior && last && prior.spend > 0 ? ((last.spend - prior.spend) / prior.spend) * 100 : null;
      return { theme, first, last, change, yoy };
    });
    const ranked = [...series].filter((item) => item.change !== null).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
    const describe = (item: (typeof series)[number]) =>
      item.first && item.last
        ? `${item.theme}: ${crore(item.first.spend)} in ${item.first.year} to ${crore(item.last.spend)} in ${item.last.year} ` +
          `(${pct(item.change)} overall; ${pct(item.yoy)} in the latest year)`
        : `${item.theme}: no yearly data`;
    return {
      understood: true,
      answer:
        series.map(describe).join(". ") + ". " +
        (ranked.length >= 2 ? `${ranked[0].theme} grew faster over the period.` : ""),
      facts: { comparison: series.map((item) => ({ theme: item.theme, change: item.change, yoy: item.yoy, first: item.first, last: item.last })) },
    };
  }

  // ---- compliance --------------------------------------------------------
  if (/\bcompliance|complian|obligation|2\s?%|two percent\b/i.test(question)) {
    const summary = buildSummary({ ...base, years: [] }, 0);
    const k = summary.kpis;
    return {
      understood: true,
      answer:
        k.complianceRate === null
          ? "No company in this selection discloses a CSR obligation, so a compliance rate cannot be computed."
          : `${k.complianceRate.toFixed(0)}% of companies met their disclosed CSR obligation in ${k.latestYear} — ` +
            `${count(k.complianceMet)} of ${count(k.complianceBase)} filers that disclose one. ` +
            `Companies that disclose no obligation are excluded from both sides of the ratio.`,
      facts: { complianceRate: k.complianceRate, met: k.complianceMet, base: k.complianceBase, year: k.latestYear },
    };
  }

  // ---- aspirational districts -------------------------------------------
  if (/\baspirational\b/i.test(question)) {
    const summary = buildSummary(scoped, 0);
    const k = summary.kpis;
    return {
      understood: true,
      answer:
        `${crore(k.aspirationalSpend)} (${(k.aspirationalShare * 100).toFixed(1)}% of ${crore(k.totalSpend)})` +
        `${named ? ` from ${named}` : ""}${year ? ` in ${year}` : ""} went to NITI Aayog's 112 aspirational districts. ` +
        "See the Aspirational Districts page for the district list and trend.",
      facts: { aspirationalSpend: k.aspirationalSpend, aspirationalShare: k.aspirationalShare, totalSpend: k.totalSpend, year },
    };
  }

  // ---- concentration -----------------------------------------------------
  if (/\bconcentrat|how spread|distribut(ed|ion) across compan|dominat/i.test(question)) {
    const summary = buildSummary(scoped, 5);
    const k = summary.kpis;
    const leader = summary.topCompanies[0];
    return {
      understood: true,
      answer:
        `Amount spent is concentrated: the top 10 companies hold ${(k.top10Share * 100).toFixed(1)}% of the total. ` +
        `${leader?.name} alone accounts for ${((leader?.share ?? 0) * 100).toFixed(1)}% (${crore(leader?.value ?? 0)}). ` +
        `The mean company spends ${crore(k.avgSpendPerCompany)} but the median is ${crore(k.medianSpendPerCompany)} — ` +
        `quote the median when describing a typical filer.`,
      facts: { top10Share: k.top10Share, leader: leader?.name, mean: k.avgSpendPerCompany, median: k.medianSpendPerCompany },
    };
  }

  // ---- company profile: "where does ITC invest", "Infosys foundation" ------
  if (namedCompany && (!dimension || dimension === "company" || (dimension === "year" && year)) && metric !== "growth" && !/\bhow many\b/i.test(question)) {
    const summary = buildSummary(scoped, 0);
    const k = summary.kpis;
    const companyName = displayCompanyName(namedCompany.name);
    const foundationNote = /\bfoundation\b/i.test(question) && !/foundation/i.test(namedCompany.name)
      ? ` A company's foundation is not a separate filer: its CSR projects are filed under ${companyName}, shown here.`
      : "";
    const othersNote = companyMatch?.others.length
      ? ` Other companies named “${companyMatch.matched}”: ${companyMatch.others.map((index) => displayCompanyName(data.companies[index].name)).join(", ")}; ask for one by its full name.`
      : "";
    if (k.projectCount === 0) {
      return {
        understood: true,
        answer: `${companyName} has no CSR projects${year ? ` in ${year}` : ""} in the current selection. Try clearing the filters.${foundationNote}`,
        facts: { company: namedCompany.name, year },
      };
    }
    const named = summary.byState.filter((row) => row.name !== "Pan India" && row.name !== "Not Specified");
    const unplaced = summary.byState
      .filter((row) => row.name === "Pan India" || row.name === "Not Specified")
      .reduce((sum, row) => sum + row.value, 0);
    const share = (value: number) => `${((value / (k.totalSpend || 1)) * 100).toFixed(0)}%`;
    const states = named.slice(0, 3).map((row) => `${row.name} ${crore(row.value)} (${share(row.value)})`).join(", ");
    const districts = summary.byDistrict.slice(0, 3).map((row) => row.name).join(", ");
    const themes = summary.byTheme.slice(0, 3).map((row) => `${row.name} (${share(row.value)})`).join(", ");
    const years = summary.trend.length > 1 ? `${summary.trend[0].year} to ${summary.trend[summary.trend.length - 1].year}` : summary.trend[0]?.year ?? "";
    return {
      understood: true,
      answer:
        `${companyName} spent ${crore(k.totalSpend)} on ${count(k.projectCount)} CSR project${k.projectCount === 1 ? "" : "s"}` +
        `${namedTheme ? ` in ${namedTheme}` : ""}${namedSector ? ` (${namedSector})` : ""}${namedState ? ` in ${namedState}` : ""}${year ? ` in ${year}` : years ? ` (${years})` : ""}. ` +
        (states ? `Largest states: ${states}. ` : "") +
        (unplaced > 0 ? `${crore(unplaced)} (${share(unplaced)}) is filed as Pan India or without a state. ` : "") +
        (districts ? `Top districts: ${districts}. ` : "") +
        (themes ? `Main areas: ${themes}.` : "") +
        (k.totalSpend < 1
          ? " Very little of this company's CSR is filed project by project on the MCA portal; its annual report CSR annexure gives the full figure."
          : "") +
        foundationNote +
        othersNote,
      facts: {
        company: companyName, year, totalSpend: k.totalSpend, projects: k.projectCount,
        states: named.slice(0, 5), panIndiaOrUnspecified: unplaced, districts: summary.byDistrict.slice(0, 5),
        themes: summary.byTheme.slice(0, 5),
      },
    };
  }

  // ---- totals for a named entity ----------------------------------------
  if (named && !dimension) {
    const summary = buildSummary(scoped, 3);
    const k = summary.kpis;
    if (k.projectCount === 0) {
      return {
        understood: true,
        answer: `No projects match ${named}${year ? ` in ${year}` : ""} in the current selection.`,
        facts: { entity: named, year },
      };
    }
    return {
      understood: true,
      answer:
        `${named}${year ? ` in ${year}` : ""}: ${crore(k.totalSpend)} across ${count(k.projectCount)} projects` +
        `${namedCompany ? "" : ` and ${count(k.companyCount)} companies`}.` +
        (k.yoyGrowthPct !== null ? ` Year on year that is ${pct(k.yoyGrowthPct)}.` : "") +
        (summary.byState[0] && !namedState ? ` Largest state: ${summary.byState[0].name} (${crore(summary.byState[0].value)}).` : "") +
        (summary.byTheme[0] && !namedTheme ? ` Largest category: ${summary.byTheme[0].name}.` : ""),
      facts: {
        entity: named, year, totalSpend: k.totalSpend, projects: k.projectCount,
        companies: k.companyCount, yoyGrowthPct: k.yoyGrowthPct,
      },
    };
  }

  // ---- counts ------------------------------------------------------------
  if (/\bhow many\b/i.test(question)) {
    const summary = buildSummary(scoped, 0);
    const k = summary.kpis;
    const what =
      metric === "projects" ? `${count(k.projectCount)} projects`
      : metric === "companies" ? `${count(k.companyCount)} companies`
      : dimension === "state" ? `${k.stateCount} states and union territories`
      : dimension === "district" ? `${count(k.districtCount)} districts`
      : dimension === "sector" ? `${k.sectorCount} sectors`
      : `${count(k.projectCount)} projects across ${count(k.companyCount)} companies`;
    return {
      understood: true,
      answer: `${what}${year ? ` in ${year}` : ""}${named ? ` for ${named}` : ""}, totalling ${crore(k.totalSpend)}.`,
      facts: { year, projects: k.projectCount, companies: k.companyCount, totalSpend: k.totalSpend },
    };
  }

  // ---- ranking by dimension ---------------------------------------------
  if (dimension && dimension !== "year") {
    const rows = selectRows(scoped);
    const grouped = groupBy(rows, dimension);
    const tidy = (rows: NamedValue[]) =>
      dimension === "company" ? rows.map((row) => ({ ...row, name: displayCompanyName(row.name) })) : rows;
    let list: NamedValue[] = tidy(grouped.rows);

    // "Pan India" and "Not Specified" are filing conventions, not places.
    if (dimension === "state") {
      list = list.filter((row) => row.name !== "Pan India" && row.name !== "Not Specified");
    }
    if (dimension === "sector") list = list.filter((row) => row.name !== "Unclassified");
    if (!list.length) {
      return { understood: true, answer: "Nothing matches the current selection.", facts: {} };
    }

    if (metric === "growth") {
      // Growth needs two years, so ignore any single-year scoping here.
      const growthRows = tidy(groupBy(selectRows({ ...scoped, years: [] }), dimension).rows)
        // Floor the prior-year base: a 68% swing on ₹5 Cr is noise, not a
        // finding, and would crowd out the movements that actually matter.
        // A zero latest year almost always means no filing in the data yet, not a real fall.
        .filter((row) => (row.previous ?? 0) >= MIN_GROWTH_BASE && (row.latest ?? 0) > 0 && row.yoyGrowthPct !== null)
        .filter((row) =>
          dimension === "state" ? row.name !== "Pan India" && row.name !== "Not Specified" : true,
        )
        .sort((a, b) => (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0));
      if (!growthRows.length) {
        return {
          understood: true,
          answer: "Not enough year-on-year history in this selection to rank growth.",
          facts: {},
        };
      }
      const picked = direction === "top" ? growthRows.slice(0, 3) : growthRows.slice(-3).reverse();
      const lead = picked[0];
      const verb = direction === "top" ? "grew the most" : "declined the most";
      return {
        understood: true,
        answer:
          `${lead.name} ${verb}: ${pct(lead.yoyGrowthPct ?? null)} year on year, ` +
          `from ${crore(lead.previous ?? 0)} to ${crore(lead.latest ?? 0)}. ` +
          `Next: ${picked.slice(1).map((row) => `${row.name} ${pct(row.yoyGrowthPct ?? null)}`).join(", ")}. ` +
          `Ranked across all years, among ${PLURAL[dimension]} with at least ${MIN_GROWTH_BASE} Cr in the prior year.`,
        facts: {
          dimension, metric: "growth", direction,
          results: picked.map((row) => ({
            name: row.name, growthPct: row.yoyGrowthPct, previous: row.previous, latest: row.latest,
          })),
        },
      };
    }

    const key = metric === "projects" ? "count" : metric === "companies" ? "companies" : "value";
    const sorted = [...list].sort(
      (a, b) => ((b[key as keyof NamedValue] as number) ?? 0) - ((a[key as keyof NamedValue] as number) ?? 0),
    );
    const picked = direction === "top" ? sorted.slice(0, 3) : sorted.slice(-3).reverse();
    const lead = picked[0];
    const format = (row: NamedValue) =>
      metric === "projects" ? `${count(row.count ?? 0)} projects`
      : metric === "companies" ? `${count(row.companies ?? 0)} companies`
      : crore(row.value);

    return {
      understood: true,
      answer:
        `${direction === "top" ? "Highest" : "Lowest"} ${LABEL[dimension]} by ` +
        `${metric === "spend" ? "CSR spend" : metric}${named ? ` for ${named}` : ""}${year ? ` in ${year}` : ""}: ` +
        `${lead.name} with ${format(lead)}` +
        (metric === "spend" && lead.share ? ` (${(lead.share * 100).toFixed(1)}% of the total in view)` : "") +
        `. Then ${picked.slice(1).map((row) => `${row.name} ${format(row)}`).join(", ")}.` +
        (dimension === "state" ? " Pan India and unattributed filings are excluded from state rankings." : ""),
      facts: {
        dimension, metric, direction, year,
        results: picked.map((row) => ({
          name: row.name, spend: row.value, share: row.share, projects: row.count, companies: row.companies,
        })),
      },
    };
  }

  // ---- year-over-year / overall trend ------------------------------------
  if (dimension === "year" || /\btrend|over time|year on year|yoy|forecast|projection\b/i.test(question)) {
    const summary = buildSummary({ ...base, years: [] }, 0);
    const trend = summary.trend;
    if (!trend.length) return { understood: true, answer: "No yearly data in this selection.", facts: {} };
    return {
      understood: true,
      answer:
        trend.map((point) => `${point.year}: ${crore(point.spend)}`).join(" · ") +
        (summary.kpis.yoyGrowthPct !== null
          ? `. Latest year on year: ${pct(summary.kpis.yoyGrowthPct)}.`
          : "") +
        ` Reporting coverage moved from ${count(trend[0].companies)} to ${count(trend[trend.length - 1].companies)} companies, ` +
        `so the years are not strictly like for like.`,
      facts: { trend, yoyGrowthPct: summary.kpis.yoyGrowthPct },
    };
  }

  // ---- a name we do not know --------------------------------------------
  // Answering the grand total here would look like an answer about the name.
  if (!dimension && !named && !/\btotal|overall|altogether|sum\b/i.test(question)) {
    const unknown = unknownWords(question);
    if (unknown.length) {
      const suggestions = similarCompanies(unknown[0]);
      return {
        understood: false,
        answer:
          `I could not find “${unknown.join(" ")}” among the companies, states, sectors or Schedule VII categories in this data. ` +
          (suggestions.length ? `Did you mean ${suggestions.join(", ")}? ` : "") +
          "Try a company's name as filed (for example “Where does ITC invest in CSR?”), a state, a sector or a category.",
        facts: { unknown, suggestions },
      };
    }
  }

  // ---- overall total -----------------------------------------------------
  if (/\btotal|overall|altogether|sum\b/i.test(question) || (!dimension && !named)) {
    const summary = buildSummary(scoped, 3);
    const k = summary.kpis;
    if (k.projectCount === 0) {
      return { understood: true, answer: "Nothing matches the current selection.", facts: {} };
    }
    return {
      understood: true,
      answer:
        `${crore(k.totalSpend)}${year ? ` in ${year}` : ""} across ${count(k.projectCount)} projects and ` +
        `${count(k.companyCount)} companies, covering ${k.stateCount} states and ${count(k.districtCount)} districts.` +
        (k.yoyGrowthPct !== null ? ` Year on year: ${pct(k.yoyGrowthPct)}.` : ""),
      facts: {
        totalSpend: k.totalSpend, projects: k.projectCount, companies: k.companyCount,
        states: k.stateCount, districts: k.districtCount, yoyGrowthPct: k.yoyGrowthPct,
      },
    };
  }

  return {
    understood: false,
    answer:
      "I could not read that as a question about this dataset. I can answer things like: " +
      "“which state has the highest CSR spent?”, “which sectors declined the most?”, " +
      "“how much did Reliance Industries spend in FY 2022-23?”, “how many projects in Maharashtra?”, " +
      "“what is the compliance rate?”, “how concentrated is amount spent?”, or “show the yearly trend”. " +
      "Ask about a state, district, sector, company, Schedule VII category, or a financial year.",
    facts: {},
  };
}

/** Small helper so the API can report what the engine supports. */
export function nlqCapabilities() {
  const data = getDataset();
  return {
    dimensions: ["state", "district", "sector", "company", "category", "implementation mode", "year"],
    metrics: ["spend", "growth", "projects", "companies"],
    years: data.yearOrder.map((index) => data.years[index]),
    entities: {
      states: data.states.length,
      sectors: data.sectors.length,
      companies: data.companies.length,
      categories: data.themes.length,
    },
  };
}

export const NLQ_SUGGESTIONS = [
  "Where does ITC invest in CSR?",
  "Which state has the highest CSR spent?",
  "Which sectors declined the most?",
  "What is the compliance rate?",
  "How concentrated is CSR spent?",
  "Show the yearly trend",
  "How many projects are in Maharashtra?",
];

export function roundedFor(value: number) {
  return round(value);
}
