/**
 * Policy Insights: the items NITI Aayog's CSR consultation asks about that the
 * standard pages do not show — coverage against all-India totals, PSU vs private,
 * aspirational districts against their population share, disaster relief vs risk
 * reduction, disability, unspent CSR, impact assessment and implementing partners.
 */
import nationalJson from "@/lib/reference/national-totals.json";
import { ASPIRATIONAL_DISTRICT_COUNT, ASPIRATIONAL_POPULATION_SHARE, companyMatchKey, FOCUS_TAGS } from "@/lib/data-cleanup";
import { getDataset, groupBy, round, selectRows } from "@/lib/dataset";
import { readExtra, type ExtraRecord } from "@/lib/extra-data";
import type { Filters } from "@/types";

const NATIONAL = nationalJson as { source: string; years: Record<string, number> };

interface Named { name: string; value: number; share?: number; count?: number }

function topCompanies(rows: Iterable<number>, limit = 5): Named[] {
  const data = getDataset();
  const sums = new Map<number, number>();
  let total = 0;
  for (const row of rows) {
    const value = data.spent[row];
    if (Number.isNaN(value)) continue;
    sums.set(data.companyIdx[row], (sums.get(data.companyIdx[row]) ?? 0) + value);
    total += value;
  }
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([index, value]) => ({ name: data.companies[index].name, value: round(value), share: total ? value / total : 0 }));
}

/** Company-level filters applied to uploaded financial / partner records. */
function recordFilter(filters: Filters, yearsInView: Set<string>) {
  const data = getDataset();
  const companyKeys = filters.companies.length
    ? new Set(filters.companies.map((id) => data.companyIdToIndex.get(id)).filter((i): i is number => i !== undefined).map((i) => companyMatchKey(data.companies[i].name)))
    : null;
  const sectorOf = new Map(data.companies.map((company) => [companyMatchKey(company.name), company.sector]));
  const sectors = filters.sectors.length ? new Set(filters.sectors.map((s) => s.toLowerCase())) : null;
  const ownership = filters.ownership.length ? new Set(filters.ownership) : null;
  const states = filters.states.length ? new Set(filters.states.map((s) => s.toLowerCase())) : null;
  return (record: ExtraRecord) =>
    yearsInView.has(record.year) &&
    (!companyKeys || companyKeys.has(record.companyKey)) &&
    (!sectors || sectors.has((sectorOf.get(record.companyKey) ?? "").toLowerCase())) &&
    (!ownership || ownership.has(record.ownership)) &&
    (!states || !record.state || states.has(String(record.state).toLowerCase()));
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function buildPolicyInsights(filters: Filters) {
  const data = getDataset();
  const rows = selectRows(filters);
  let total = 0;
  const yearSpend = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 1) {
    const value = data.spent[rows[i]];
    if (Number.isNaN(value)) continue;
    total += value;
    const year = data.years[data.yearIdx[rows[i]]];
    yearSpend.set(year, (yearSpend.get(year) ?? 0) + value);
  }
  const years = data.yearOrder.map((index) => data.years[index]).filter((year) => yearSpend.has(year));
  const yearsInView = new Set(years);
  const otherFilters =
    filters.sectors.length + filters.states.length + filters.districts.length + filters.themes.length +
    filters.companies.length + filters.modes.length + filters.ownership.length +
    (filters.search.trim() ? 1 : 0) + (filters.minSpend !== null || filters.maxSpend !== null ? 1 : 0) + (filters.aspirationalOnly ? 1 : 0);

  // 1. coverage against all-India MCA totals ---------------------------------------
  const coverage = years
    .filter((year) => NATIONAL.years[year] !== undefined)
    .map((year) => ({ year, dashboard: round(yearSpend.get(year) ?? 0), national: NATIONAL.years[year], share: (yearSpend.get(year) ?? 0) / NATIONAL.years[year] }));

  // 2. ownership ------------------------------------------------------------------
  const ownership = groupBy(rows, "ownership");
  const ownershipRows = ownership.rows.map((row) => {
    const classIndex = data.ownerships.indexOf(row.name);
    const members: number[] = [];
    for (let i = 0; i < rows.length; i += 1) if (data.ownershipIdx[rows[i]] === classIndex) members.push(rows[i]);
    return { ...row, topCompanies: topCompanies(members, 3) };
  });
  const ownershipSeries = ownership.series;

  // 3. aspirational districts --------------------------------------------------------
  const aspByYear = new Map<string, number>();
  const aspDistricts = new Set<number>();
  const aspRows: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!data.aspirational[row]) continue;
    aspRows.push(row);
    if (data.districtIdx[row] >= 0) aspDistricts.add(data.districtIdx[row]);
    const value = data.spent[row];
    if (Number.isNaN(value)) continue;
    const year = data.years[data.yearIdx[row]];
    aspByYear.set(year, (aspByYear.get(year) ?? 0) + value);
  }
  const aspTotal = [...aspByYear.values()].reduce((s, v) => s + v, 0);
  const aspirational = {
    total: round(aspTotal),
    share: total ? aspTotal / total : 0,
    populationShare: ASPIRATIONAL_POPULATION_SHARE,
    officialCount: ASPIRATIONAL_DISTRICT_COUNT,
    districtsReached: aspDistricts.size,
    byYear: years.map((year) => ({ year, spend: round(aspByYear.get(year) ?? 0), share: (aspByYear.get(year) ?? 0) / (yearSpend.get(year) || 1) })),
    topCompanies: topCompanies(aspRows, 5),
  };

  // 4. focus tags from project names ---------------------------------------------------
  const focus = FOCUS_TAGS.map((tag, bit) => {
    const members: number[] = [];
    const byYear = new Map<string, number>();
    const companies = new Set<number>();
    let spend = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!(data.focus[row] & (1 << bit))) continue;
      members.push(row);
      companies.add(data.companyIdx[row]);
      const value = data.spent[row];
      if (Number.isNaN(value)) continue;
      spend += value;
      const year = data.years[data.yearIdx[row]];
      byYear.set(year, (byYear.get(year) ?? 0) + value);
    }
    return {
      id: tag.id, label: tag.label, spend: round(spend), share: total ? spend / total : 0,
      projects: members.length, companies: companies.size,
      byYear: years.map((year) => ({ year, spend: round(byYear.get(year) ?? 0) })),
      topCompanies: topCompanies(members, 5),
    };
  });

  // 5. uploaded financials ------------------------------------------------------------
  const keep = recordFilter(filters, yearsInView);
  const financialStore = readExtra("financials");
  const fin = (financialStore?.records ?? []).filter(keep);
  const sumOf = (key: string, list = fin) => round(list.reduce((s, r) => s + num(r[key]), 0));
  const unspentByCompany = new Map<string, number>();
  for (const r of fin) unspentByCompany.set(r.company, (unspentByCompany.get(r.company) ?? 0) + num(r.unspent));
  const financials = financialStore
    ? {
        uploadedAt: financialStore.uploadedAt,
        fileName: financialStore.fileName,
        records: fin.length,
        companies: new Set(fin.map((r) => r.companyKey)).size,
        obligation: sumOf("obligation"), totalSpent: sumOf("totalSpent"), unspent: sumOf("unspent"),
        toUnspentAccount: sumOf("toUnspentAccount"), toScheduleVIIFund: sumOf("toScheduleVIIFund"),
        overheads: sumOf("overheads"), impact: sumOf("impact"),
        impactApplicable: fin.filter((r) => r.impactApplicable === true).length,
        impactReports: fin.filter((r) => typeof r.impactReport === "string" && r.impactReport).length,
        byYear: years.map((year) => {
          const list = fin.filter((r) => r.year === year);
          return { year, obligation: sumOf("obligation", list), totalSpent: sumOf("totalSpent", list), unspent: sumOf("unspent", list), toUnspentAccount: sumOf("toUnspentAccount", list), impact: sumOf("impact", list) };
        }),
        topUnspent: [...unspentByCompany.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value: round(value) })),
      }
    : null;

  // 6. uploaded implementing partners ------------------------------------------------------
  const partnerStore = readExtra("partners");
  const par = (partnerStore?.records ?? []).filter(keep);
  const agencies = new Map<string, { name: string; value: number; companies: Set<string>; states: Set<string>; registration: string | null }>();
  for (const r of par) {
    const name = String(r.agency);
    const key = name.toLowerCase();
    const entry = agencies.get(key) ?? { name, value: 0, companies: new Set(), states: new Set(), registration: null };
    entry.value += num(r.amount);
    entry.companies.add(r.company);
    if (r.state) entry.states.add(String(r.state));
    if (!entry.registration && typeof r.registration === "string") entry.registration = r.registration;
    agencies.set(key, entry);
  }
  const partnerStates = new Map<string, Set<string>>();
  for (const r of par) if (r.state) partnerStates.set(String(r.state), (partnerStates.get(String(r.state)) ?? new Set()).add(String(r.agency).toLowerCase()));
  const partners = partnerStore
    ? {
        uploadedAt: partnerStore.uploadedAt,
        fileName: partnerStore.fileName,
        records: par.length,
        agencies: agencies.size,
        amount: round(par.reduce((s, r) => s + num(r.amount), 0)),
        registered: [...agencies.values()].filter((a) => a.registration).length,
        top: [...agencies.values()].sort((a, b) => b.value - a.value).slice(0, 15).map((a) => ({ name: a.name, value: round(a.value), companies: a.companies.size, states: a.states.size, registration: a.registration })),
        byState: [...partnerStates.entries()].map(([name, set]) => ({ name, agencies: set.size })).sort((a, b) => b.agencies - a.agencies).slice(0, 15),
      }
    : null;

  return {
    generatedAt: data.generatedAt,
    total: round(total),
    years,
    filtered: otherFilters > 0,
    nationalSource: NATIONAL.source,
    coverage,
    ownership: ownershipRows,
    ownershipSeries,
    aspirational,
    focus,
    financials,
    partners,
    cleanup: data.cleanup,
  };
}

export type PolicyInsights = ReturnType<typeof buildPolicyInsights>;
