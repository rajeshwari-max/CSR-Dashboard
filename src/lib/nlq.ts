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

import { buildSummary, getDataset, groupBy, round, selectRows } from "@/lib/dataset";
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
  [/\b(growth|grew|growing|gain|gained|rise|rose|rising|increase|increased|declin|fell|fall|falling|drop|dropped|shrink|shrank)/i, "growth"],
  [/\b(project|projects|initiative|initiatives)\b/i, "projects"],
  [/\b(compan|firm|filer)/i, "companies"],
  [/\b(spend|spent|spending|amount|money|funding|funded|invest|contribut|allocat|csr)/i, "spend"],
];

/** Minimum prior-year spend (INR Cr) before a growth rate is worth ranking. */
const MIN_GROWTH_BASE = 25;

const BOTTOM_WORDS = /\b(least|lowest|smallest|bottom|worst|minimum|declin|fell|fall|falling|drop|dropped|shrink|shrank)\b/i;
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
  return best ? vocabulary.find((value) => value.toLowerCase() === best) ?? null : null;
}

function detect<T>(question: string, table: [RegExp, T][]): T | null {
  for (const [pattern, value] of table) if (pattern.test(question)) return value;
  return null;
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

const LABEL: Record<Dimension, string> = {
  state: "state", district: "district", sector: "sector",
  company: "company", theme: "category", mode: "implementation mode", year: "year",
};

export function answerQuestion(question: string, filters: Filters): NlqAnswer {
  const data = getDataset();
  const years = [...data.years].sort();
  const base: Filters = { ...EMPTY_FILTERS, ...filters };

  const year = parseYear(question, years);
  const dimension = detect(question, DIMENSION_WORDS);
  const metric = detect(question, METRIC_WORDS) ?? "spend";
  const direction: Direction = BOTTOM_WORDS.test(question) && !TOP_WORDS.test(question) ? "bottom" : "top";

  // Entity mentioned by name? Scope the answer to it.
  const namedState = findEntity(question, data.states);
  const namedSector = findEntity(question, data.sectors);
  const namedTheme = findEntity(question, data.themes);
  const namedCompany = data.companies.find((company) =>
    question.toLowerCase().includes(company.name.toLowerCase()),
  );

  const scoped: Filters = {
    ...base,
    years: year ? [year] : base.years,
    states: namedState ? [namedState] : base.states,
    sectors: namedSector ? [namedSector] : base.sectors,
    themes: namedTheme ? [namedTheme] : base.themes,
    companies: namedCompany ? [namedCompany.id] : base.companies,
  };

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

  // ---- concentration -----------------------------------------------------
  if (/\bconcentrat|how spread|distribut(ed|ion) across compan|dominat/i.test(question)) {
    const summary = buildSummary(scoped, 5);
    const k = summary.kpis;
    const leader = summary.topCompanies[0];
    return {
      understood: true,
      answer:
        `Spend is concentrated: the top 10 companies hold ${(k.top10Share * 100).toFixed(1)}% of the total. ` +
        `${leader?.name} alone accounts for ${((leader?.share ?? 0) * 100).toFixed(1)}% (${crore(leader?.value ?? 0)}). ` +
        `The mean company spends ${crore(k.avgSpendPerCompany)} but the median is ${crore(k.medianSpendPerCompany)} — ` +
        `quote the median when describing a typical filer.`,
      facts: { top10Share: k.top10Share, leader: leader?.name, mean: k.avgSpendPerCompany, median: k.medianSpendPerCompany },
    };
  }

  // ---- totals for a named entity ----------------------------------------
  const named = namedCompany?.name ?? namedState ?? namedSector ?? namedTheme;
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
    let list: NamedValue[] = grouped.rows;

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
      const growthRows = groupBy(selectRows({ ...scoped, years: [] }), dimension).rows
        // Floor the prior-year base: a 68% swing on ₹5 Cr is noise, not a
        // finding, and would crowd out the movements that actually matter.
        .filter((row) => (row.previous ?? 0) >= MIN_GROWTH_BASE && row.yoyGrowthPct !== null)
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
          `Ranked across all years, among ${LABEL[dimension]}s with at least ${MIN_GROWTH_BASE} Cr in the prior year.`,
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
        `${metric === "spend" ? "CSR spend" : metric}${year ? ` in ${year}` : ""}: ` +
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
      "“which state has the highest CSR spend?”, “which sectors declined the most?”, " +
      "“how much did Reliance Industries spend in FY 2022-23?”, “how many projects in Maharashtra?”, " +
      "“what is the compliance rate?”, “how concentrated is spend?”, or “show the yearly trend”. " +
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
    years: [...data.years].sort(),
    entities: {
      states: data.states.length,
      sectors: data.sectors.length,
      companies: data.companies.length,
      categories: data.themes.length,
    },
  };
}

export const NLQ_SUGGESTIONS = [
  "Which state has the highest CSR spend?",
  "Which sectors declined the most?",
  "What is the compliance rate?",
  "How concentrated is CSR spend?",
  "Show the yearly trend",
  "How many projects are in Maharashtra?",
];

export function roundedFor(value: number) {
  return round(value);
}
