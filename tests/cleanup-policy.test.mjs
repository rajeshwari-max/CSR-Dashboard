// Load-time data clean-up, ownership, older years, Policy Insights and the
// financials / partners templates. Run with: npm run test:policy
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = await mkdtemp(path.join(tmpdir(), "cms-extra-"));
// Uploaded financials/partners go to a temp folder; the dataset is read from ./data.
const { companyMatchKey, isAspirationalDistrict, ownershipOf, focusBits } = await import("@/lib/data-cleanup");
const { getDataset, buildSummary, selectRows } = await import("@/lib/dataset");
const { EMPTY_FILTERS } = await import("@/types");
after(async () => rm(dataDir, { recursive: true, force: true }));

test("name variants share a match key; subsidiaries and different companies do not", () => {
  assert.equal(companyMatchKey("Jindal Steel & Power Limited"), companyMatchKey("Jindal Steel And Power Limited"));
  assert.equal(companyMatchKey("Dr. Reddy's Laboratories Limited"), companyMatchKey("Dr.Reddys Laboratories Limited"));
  assert.equal(companyMatchKey("TCS"), companyMatchKey("Tata Consultancy Services Limited"));
  assert.equal(companyMatchKey("Redington (India) Limited"), companyMatchKey("Redington Limited"));
  assert.notEqual(companyMatchKey("Sagar Cements (R) Limited"), companyMatchKey("Sagar Cements Limited"));
  assert.notEqual(companyMatchKey("Welspun Corp Limited"), companyMatchKey("Welspun India Limited"));
});

test("aspirational districts match by state and district, including former names", () => {
  assert.equal(isAspirationalDistrict("Bihar", "Aurangabad"), true);
  assert.equal(isAspirationalDistrict("Maharashtra", "Aurangabad"), false);
  assert.equal(isAspirationalDistrict("Haryana", "Nuh"), true);
  assert.equal(isAspirationalDistrict("Andhra Pradesh", "Visakhapatnam"), true);
});

test("ownership classes and focus tags", () => {
  assert.equal(ownershipOf("Ntpc Limited"), "Central PSU");
  assert.equal(ownershipOf("State Bank of India"), "Public sector bank");
  assert.equal(ownershipOf("Reliance Industries Limited"), "Private");
  assert.ok(focusBits("Covid-19 relief kits") & 1);
  assert.ok(focusBits("Cyclone shelter and disaster preparedness") & 2);
  assert.ok(focusBits("Assistive devices for divyang children") & 4);
});

test("clean-up merges companies, removes duplicate lines and keeps old ids working", () => {
  const data = getDataset();
  assert.ok(data.cleanup.companiesMerged >= 30);
  assert.ok(data.cleanup.duplicateRows > 0);
  const tcs = data.companyIdToIndex.get("tcs");
  assert.ok(tcs !== undefined);
  assert.match(data.companies[tcs].name, /Tata Consultancy Services/);
  const names = data.companies.map((c) => c.name);
  assert.ok(!names.includes("TCS"), "the short spelling is folded into the full name");
});

test("default view is FY 2020-21 onward; earlier years only when picked", () => {
  const data = getDataset();
  const all = selectRows({ ...EMPTY_FILTERS });
  for (const row of all.slice(0, 5000)) assert.ok(Number(data.years[data.yearIdx[row]].slice(3, 7)) >= 2020);
  const older = buildSummary({ ...EMPTY_FILTERS, years: ["FY 2018-19"] }, 5);
  assert.deepEqual(older.trend.map((t) => t.year), ["FY 2018-19"]);
  assert.ok(older.kpis.totalSpend > 0);
});

test("ownership filter splits the total exactly", () => {
  const total = buildSummary({ ...EMPTY_FILTERS }, 5).kpis.totalSpend;
  const parts = ["Central PSU", "State PSU", "Public sector bank", "Public sector insurer", "Private"]
    .map((o) => buildSummary({ ...EMPTY_FILTERS, ownership: [o] }, 5).kpis.totalSpend);
  assert.ok(Math.abs(parts.reduce((s, v) => s + v, 0) - total) < 0.5);
});

test("policy insights and template upload round-trip", async () => {
  const { buildPolicyInsights } = await import("@/lib/policy");
  const before = buildPolicyInsights({ ...EMPTY_FILTERS });
  assert.equal(before.coverage.length, 5);
  assert.ok(before.coverage.every((c) => c.share > 0.3 && c.share < 0.6));
  assert.ok(before.aspirational.districtsReached > 60 && before.aspirational.districtsReached <= 112);
  assert.equal(before.focus.length, 3);

  const { parseExtra } = await import("@/lib/extra-data");
  const tables = [{ name: "Financials", headers: ["Company Name", "Financial Year", "Prescribed CSR Obligation (INR Cr)", "Total CSR Spent (INR Cr)", "Transferred to Unspent CSR Account (INR Cr)"],
    rows: [{ "Company Name": "Itc Limited", "Financial Year": "2023-24", "Prescribed CSR Obligation (INR Cr)": 403.47, "Total CSR Spent (INR Cr)": 404.05, "Transferred to Unspent CSR Account (INR Cr)": 0 },
      { "Company Name": "Example Co", "Financial Year": "FY 2023-24", "Prescribed CSR Obligation (INR Cr)": 10, "Total CSR Spent (INR Cr)": 8 }] }];
  const parsed = parseExtra("financials", tables);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].year, "FY 2023-24");
  assert.equal(parsed.records[0].unspent, 0);
  assert.equal(parsed.records[1].unspent, 2);
  const missing = parseExtra("partners", tables);
  assert.ok(missing.missingColumns.includes("Implementing Agency Name"));
});

test("partner rows carry a role: implementation by default, M&E for evaluation agencies", async () => {
  const { parseExtra, partnerRole } = await import("@/lib/extra-data");
  assert.equal(partnerRole("Impact Assessment"), "M&E");
  assert.equal(partnerRole("M & E"), "M&E");
  assert.equal(partnerRole("monitoring and evaluation"), "M&E");
  assert.equal(partnerRole(""), "Implementation");
  assert.equal(partnerRole(null), "Implementation");
  const headers = ["Company Name", "Financial Year", "Implementing Agency Name", "Role (Implementation or M&E)", "Amount Spent (INR Cr)"];
  const parsed = parseExtra("partners", [{ name: "Partners", headers, rows: [
    { "Company Name": "ITC Limited", "Financial Year": "FY 2023-24", "Implementing Agency Name": "Example Foundation", "Amount Spent (INR Cr)": 5 },
    { "Company Name": "ITC Limited", "Financial Year": "FY 2023-24", "Implementing Agency Name": "Example Evaluators LLP", "Role (Implementation or M&E)": "Impact assessment", "Amount Spent (INR Cr)": 0.2 },
  ] }]);
  assert.deepEqual(parsed.records.map((r) => r.role), ["Implementation", "M&E"]);
});
