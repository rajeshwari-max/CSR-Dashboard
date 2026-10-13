// Natural-language search: company names as people type them, categories,
// declines and unknown names. Run with: npm run test:nlq
import assert from "node:assert/strict";
import { test } from "node:test";

const { answerQuestion } = await import("@/lib/nlq");
const { buildExcelReport } = await import("@/lib/reports/builders");
const { getDataset } = await import("@/lib/dataset");
const { EMPTY_FILTERS } = await import("@/types");
const ask = (q) => answerQuestion(q, EMPTY_FILTERS);
const total = () => ask("total csr spend").answer;

test("short company names answer for that company, not the grand total", () => {
  for (const [q, name] of [
    ["Where does ITC invest in CSR", "ITC Limited"],
    ["where does Siemens invest in CSR", "Siemens Limited"],
    ["Infosys foundation", "Infosys Limited"],
    ["how much did ONGC spend", "Oil And Natural Gas Corporation Limited"],
    ["HDFC csr", "HDFC Bank Limited"],
  ]) {
    const a = ask(q);
    assert.ok(a.understood, q);
    assert.ok(a.answer.startsWith(name), `${q} -> ${a.answer.slice(0, 80)}`);
    assert.notEqual(a.answer, total());
  }
  assert.match(ask("Infosys foundation").answer, /foundation is not a separate filer/);
  assert.match(ask("where does ITC invest").answer, /Largest states: Andhra Pradesh/);
});

test("a name that is not in the data says so instead of giving the total", () => {
  const a = ask("where does acme widgets invest");
  assert.equal(a.understood, false);
  assert.match(a.answer, /could not find “acme widgets”/);
});

test("categories, comparisons and declines", () => {
  assert.match(ask("Is education spending growing faster than healthcare?").answer, /^Education: .*Health Care: /);
  assert.match(ask("Which sectors declined the most?").answer, /declined the most: -/);
  assert.match(ask("Which companies reduced their CSR amount spent the most?").answer, /declined the most/);
  assert.match(ask("which companies spend most in Odisha").answer, /^Highest company by CSR spend for Odisha: Tata Steel/);
  assert.match(ask("education spending in Gujarat").answer, /^Education in Gujarat:/);
});

test("company names are shown with their acronyms in capitals", () => {
  const names = new Set(getDataset().companies.map((c) => c.name));
  assert.ok(names.has("ITC Limited") && names.has("ICICI Bank Limited"));
});

test("Excel report builds the full register without the in-memory blow-up", async () => {
  const before = process.memoryUsage().rss;
  const buffer = await buildExcelReport(EMPTY_FILTERS);
  assert.ok(buffer.length > 1_000_000);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.ok(process.memoryUsage().rss - before < 600_000_000);
});
