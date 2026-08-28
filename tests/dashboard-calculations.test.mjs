import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dataset = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "dataset.json"), "utf8"));
const years = dataset.dictionaries.years;
const isReportingYear = (label) => {
  const match = /^FY\s+(\d{4})-\d{2}$/.exec(label);
  return match !== null && Number(match[1]) >= 2020;
};
const yearIndexes = [...years.keys()]
  .filter((index) => isReportingYear(years[index]))
  .sort((a, b) => years[a].localeCompare(years[b]));
const allowed = new Set(yearIndexes);
const rows = dataset.rows.filter((row) => allowed.has(row[1]));

const sum = (values) => values.reduce((total, value) => total + value, 0);
const spend = (row) => (typeof row[8] === "number" && Number.isFinite(row[8]) ? row[8] : 0);
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

test("reporting scope starts at FY 2020-21 and keeps later years", () => {
  assert.equal(years[yearIndexes[0]], "FY 2020-21");
  assert.ok(yearIndexes.every((index) => !/^FY 201\d/.test(years[index])));
  assert.ok(years[yearIndexes.at(-1)].localeCompare("FY 2024-25") >= 0);
});

test("annual spend reconciles exactly to the reporting-scope total", () => {
  const total = sum(rows.map(spend));
  const annual = yearIndexes.map((yearIndex) => sum(rows.filter((row) => row[1] === yearIndex).map(spend)));
  assert.ok(Math.abs(total - sum(annual)) < 0.0001);
  assert.ok(total > 0);
});

test("overlapping source workbooks resolve to one canonical annual register", () => {
  const expected = {
    "FY 2020-21": 13851.47,
    "FY 2021-22": 12357.24,
    "FY 2022-23": 13502.86,
  };
  for (const [year, value] of Object.entries(expected)) {
    const yearIndex = years.indexOf(year);
    const actual = sum(rows.filter((row) => row[1] === yearIndex).map(spend));
    assert.equal(round(actual), value);
  }
  assert.ok(Number(dataset.stats.overlap_rows_skipped ?? 0) > 0);
});

test("dimension totals reconcile to total CSR spend", () => {
  const expected = sum(rows.map(spend));
  for (const dimensionIndex of [0, 2, 3, 4, 5]) {
    const grouped = new Map();
    for (const row of rows) grouped.set(row[dimensionIndex], (grouped.get(row[dimensionIndex]) ?? 0) + spend(row));
    assert.ok(Math.abs(sum([...grouped.values()]) - expected) < 0.0001);
  }
});

test("project-size buckets cover every non-negative disclosed amount once", () => {
  const buckets = [[0, 0.1], [0.1, 0.5], [0.5, 1], [1, 5], [5, 25], [25, Infinity]];
  const amounts = rows.map((row) => row[8]).filter((value) => typeof value === "number" && value >= 0);
  const bucketed = sum(buckets.map(([min, max]) => amounts.filter((value) => value >= min && value < max).length));
  assert.equal(bucketed, amounts.length);
});

test("YoY calculation uses the immediately preceding reporting year", () => {
  const annual = yearIndexes.map((yearIndex) => sum(rows.filter((row) => row[1] === yearIndex).map(spend)));
  const previous = annual.at(-2);
  const latest = annual.at(-1);
  const yoy = ((latest - previous) / previous) * 100;
  assert.ok(Number.isFinite(yoy));
  assert.equal(Math.round(yoy * 100) / 100, 16);
});

test("all mandatory dictionary indexes are valid", () => {
  const sizes = [
    dataset.dictionaries.companies.length,
    dataset.dictionaries.years.length,
    dataset.dictionaries.sectors.length,
    dataset.dictionaries.states.length,
    dataset.dictionaries.themes.length,
    dataset.dictionaries.modes.length,
  ];
  for (const row of rows) {
    sizes.forEach((size, index) => assert.ok(Number.isInteger(row[index]) && row[index] >= 0 && row[index] < size));
  }
});

test("company KPI arithmetic reconciles independently", () => {
  const companyTotals = new Map();
  for (const row of rows) companyTotals.set(row[0], (companyTotals.get(row[0]) ?? 0) + spend(row));
  const total = sum(rows.map(spend));
  const allTotals = [...companyTotals.values()];
  const totals = allTotals.filter((value) => value > 0).sort((a, b) => a - b);
  const middle = Math.floor(totals.length / 2);
  const median = totals.length % 2 ? totals[middle] : (totals[middle - 1] + totals[middle]) / 2;

  assert.equal(round(sum(allTotals)), round(total));
  assert.ok(total / companyTotals.size >= 0);
  assert.ok(median >= 0);
  if (years[yearIndexes.at(-1)] === "FY 2024-25") {
    assert.equal(round(total / companyTotals.size), 54.41);
    assert.equal(round(median), 7.83);
  }
});

test("latest-year compliance uses national spend and disclosed obligations only", () => {
  const latestYearIndex = yearIndexes.at(-1);
  const latestSpend = new Map();
  for (const row of rows) {
    if (row[1] === latestYearIndex) latestSpend.set(row[0], (latestSpend.get(row[0]) ?? 0) + spend(row));
  }

  let base = 0;
  let met = 0;
  for (const [companyIndex, company] of dataset.dictionaries.companies.entries()) {
    const obligation = company.csrObligation ?? company.twoPercentNetProfit;
    if (typeof obligation !== "number" || obligation <= 0) continue;
    base += 1;
    if ((latestSpend.get(companyIndex) ?? 0) >= obligation * 0.95) met += 1;
  }

  assert.ok(base > 0 && met >= 0 && met <= base);
  if (years[latestYearIndex] === "FY 2024-25") {
    assert.equal(base, 886);
    assert.equal(met, 318);
    assert.equal(Math.round((met / base) * 100), 36);
  }
});

test("linear projection is finite, non-negative, and reports a bounded fit", () => {
  const values = yearIndexes.map((yearIndex) => sum(rows.filter((row) => row[1] === yearIndex).map(spend)));
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = sum(values) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  values.forEach((value, index) => {
    sxy += (index - meanX) * (value - meanY);
    sxx += (index - meanX) ** 2;
    syy += (value - meanY) ** 2;
  });
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const projected = Math.max(0, intercept + slope * n);
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);

  assert.ok(Number.isFinite(projected) && projected >= 0);
  assert.ok(Number.isFinite(r2) && r2 >= 0 && r2 <= 1);
});
