import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataset = JSON.parse(fs.readFileSync(path.join(root, "data", "dataset.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(root, "data", "meta.json"), "utf8"));
const years = dataset.dictionaries.years;
const startYear = 2020;
const isReportingYear = (label) => {
  const match = /^FY\s+(\d{4})-\d{2}$/.exec(String(label).trim());
  return match !== null && Number.parseInt(match[1], 10) >= startYear;
};
const reportingIndexes = new Set(years.flatMap((year, index) => (isReportingYear(year) ? [index] : [])));
const rows = dataset.rows.filter((row) => reportingIndexes.has(row[1]));

const errors = [];
const warnings = [];
const spendByYear = {};
let totalSpend = 0;
let disclosedSpendRows = 0;
let negativeSpendRows = 0;
const companies = new Set();

for (const [index, row] of rows.entries()) {
  const [companyIdx, yearIdx, sectorIdx, stateIdx, themeIdx, modeIdx] = row;
  const checks = [
    ["company", companyIdx, dataset.dictionaries.companies.length],
    ["year", yearIdx, years.length],
    ["sector", sectorIdx, dataset.dictionaries.sectors.length],
    ["state", stateIdx, dataset.dictionaries.states.length],
    ["theme", themeIdx, dataset.dictionaries.themes.length],
    ["mode", modeIdx, dataset.dictionaries.modes.length],
  ];
  for (const [label, value, size] of checks) {
    if (!Number.isInteger(value) || value < 0 || value >= size) {
      errors.push(`Row ${index}: invalid ${label} index ${value}`);
    }
  }

  companies.add(companyIdx);
  const spend = row[8];
  if (typeof spend === "number" && Number.isFinite(spend)) {
    disclosedSpendRows += 1;
    if (spend < 0) negativeSpendRows += 1;
    totalSpend += spend;
    const year = years[yearIdx];
    spendByYear[year] = (spendByYear[year] ?? 0) + spend;
  }
}

if (!years.includes("FY 2020-21")) errors.push("FY 2020-21 is missing from the source dataset.");
if (negativeSpendRows) warnings.push(`${negativeSpendRows} rows contain negative spend and are retained as disclosed.`);
if (disclosedSpendRows < rows.length) warnings.push(`${rows.length - disclosedSpendRows} rows have no disclosed spend.`);

for (const [year, value] of Object.entries(spendByYear)) {
  const expected = meta.spendByYear?.[year];
  if (typeof expected === "number" && Math.abs(value - expected) > 0.02) {
    errors.push(`${year}: calculated spend ${value.toFixed(2)} differs from metadata ${expected.toFixed(2)}.`);
  }
}

const result = {
  valid: errors.length === 0,
  reportingYears: Object.keys(spendByYear).sort(),
  rows: rows.length,
  companies: companies.size,
  disclosedSpendRows,
  totalSpend: Math.round(totalSpend * 100) / 100,
  spendByYear: Object.fromEntries(
    Object.entries(spendByYear).sort().map(([year, value]) => [year, Math.round(value * 100) / 100]),
  ),
  overlapRowsSkipped: Number(dataset.stats?.overlap_rows_skipped ?? 0),
  warnings,
  errors: errors.slice(0, 50),
};

console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
