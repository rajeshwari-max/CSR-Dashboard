/**
 * Company-year CSR financials (unspent CSR, impact assessment, overheads) and
 * implementing-partner (NGO) records. None of this is in the MCA project-level
 * register the dashboard is built on: it comes from each company's annual-report
 * CSR annexure (the standard format under the CSR Amendment Rules, 2021, from
 * FY 2020-21). The team fills an Excel template and uploads it; until then the
 * dashboard shows an empty state that says so.
 *
 * Stored next to dataset.json on the persistent disk as financials.json and
 * partners.json.
 */
import fs from "node:fs";
import path from "node:path";

import { companyMatchKey, ownershipOf } from "@/lib/data-cleanup";
import { cleanText, normaliseState, normaliseYear, normHeader, toAmount } from "@/lib/etl/vocab";
import type { SourceTable } from "@/lib/etl/build";

const DATA_DIR = process.env.CSR_DATA_DIR ? path.resolve(process.env.CSR_DATA_DIR) : path.join(process.cwd(), "data");

export type ExtraKind = "financials" | "partners";
export const EXTRA_KINDS: ExtraKind[] = ["financials", "partners"];

interface ColumnSpec { key: string; header: string; aliases: string[]; type: "text" | "amount" | "year" | "yesno"; required?: boolean; note: string }

export const COLUMNS: Record<ExtraKind, ColumnSpec[]> = {
  financials: [
    { key: "company", header: "Company Name", aliases: ["company", "name of company"], type: "text", required: true, note: "As in the dashboard; spelling differences are matched automatically" },
    { key: "cin", header: "CIN", aliases: ["cin", "corporate identity number"], type: "text", note: "Optional" },
    { key: "year", header: "Financial Year", aliases: ["year", "fy", "financial year"], type: "year", required: true, note: "e.g. FY 2023-24" },
    { key: "obligation", header: "Prescribed CSR Obligation (INR Cr)", aliases: ["prescribed csr", "two percent", "2% of average net profit", "csr obligation", "total csr obligation"], type: "amount", note: "Annexure: two percent of average net profit, after set-off" },
    { key: "projects", header: "Amount Spent on Projects (INR Cr)", aliases: ["amount spent on projects", "ongoing and other than ongoing", "project spend"], type: "amount", note: "Ongoing + other than ongoing projects" },
    { key: "overheads", header: "Administrative Overheads (INR Cr)", aliases: ["administrative overheads", "admin overheads"], type: "amount", note: "" },
    { key: "impact", header: "Impact Assessment Amount (INR Cr)", aliases: ["impact assessment amount", "amount spent on impact assessment"], type: "amount", note: "" },
    { key: "totalSpent", header: "Total CSR Spent (INR Cr)", aliases: ["total csr spent", "total amount spent for the financial year", "total amount spent"], type: "amount", note: "" },
    { key: "unspent", header: "Unspent CSR Amount (INR Cr)", aliases: ["unspent csr amount", "amount unspent", "unspent amount"], type: "amount", note: "Obligation minus total spent, if positive" },
    { key: "toUnspentAccount", header: "Transferred to Unspent CSR Account (INR Cr)", aliases: ["transferred to unspent csr account", "unspent csr account"], type: "amount", note: "Section 135(6), for ongoing projects" },
    { key: "toScheduleVIIFund", header: "Transferred to Schedule VII Fund (INR Cr)", aliases: ["transferred to schedule vii fund", "schedule vii fund", "transferred to fund"], type: "amount", note: "Section 135(5) proviso" },
    { key: "impactApplicable", header: "Impact Assessment Applicable (Yes/No)", aliases: ["impact assessment applicable", "impact assessment required"], type: "yesno", note: "" },
    { key: "impactReport", header: "Impact Assessment Report Link", aliases: ["impact assessment report", "impact assessment link"], type: "text", note: "" },
    { key: "source", header: "Source (Annual Report Link)", aliases: ["source", "annual report", "annual report link"], type: "text", note: "" },
  ],
  partners: [
    { key: "company", header: "Company Name", aliases: ["company", "name of company"], type: "text", required: true, note: "" },
    { key: "year", header: "Financial Year", aliases: ["year", "fy", "financial year"], type: "year", required: true, note: "e.g. FY 2023-24" },
    { key: "project", header: "CSR Project", aliases: ["project", "csr project", "name of the project"], type: "text", note: "" },
    { key: "state", header: "State", aliases: ["state"], type: "text", note: "" },
    { key: "district", header: "District", aliases: ["district"], type: "text", note: "" },
    { key: "agency", header: "Implementing Agency Name", aliases: ["implementing agency", "agency name", "ngo", "name of implementing agency", "partner"], type: "text", required: true, note: "" },
    { key: "role", header: "Role (Implementation or M&E)", aliases: ["role", "partner role", "type of work", "activity type"], type: "text", note: "Implementation for agencies running the project; M&E for agencies doing monitoring, evaluation or impact assessment (named in impact assessment reports). Blank = Implementation" },
    { key: "registration", header: "CSR Registration Number", aliases: ["csr registration", "registration number", "csr00"], type: "text", note: "CSR00000000 format (MCA Form CSR-1)" },
    { key: "amount", header: "Amount Spent (INR Cr)", aliases: ["amount spent", "amount"], type: "amount", note: "" },
  ],
};

export type ExtraRecord = Record<string, string | number | boolean | null> & { company: string; year: string; companyKey: string; ownership: string };

export interface ExtraStore { kind: ExtraKind; uploadedAt: string; fileName: string; records: ExtraRecord[] }

const fileFor = (kind: ExtraKind) => path.join(DATA_DIR, `${kind}.json`);
const memo = new Map<ExtraKind, { mtime: number; store: ExtraStore | null }>();

export function readExtra(kind: ExtraKind): ExtraStore | null {
  const file = fileFor(kind);
  if (!fs.existsSync(file)) return null;
  const mtime = fs.statSync(file).mtimeMs;
  const hit = memo.get(kind);
  if (hit && hit.mtime === mtime) return hit.store;
  let store: ExtraStore | null = null;
  try { store = JSON.parse(fs.readFileSync(file, "utf8")) as ExtraStore; } catch { store = null; }
  memo.set(kind, { mtime, store });
  return store;
}

function writeExtra(store: ExtraStore) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = fileFor(store.kind);
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(store), "utf8");
  fs.renameSync(temporary, file);
  memo.delete(store.kind);
}

function resolve(headers: string[], spec: ColumnSpec): string | null {
  const wanted = [spec.header, ...spec.aliases].map(normHeader);
  for (const header of headers) if (wanted.includes(normHeader(header))) return header;
  for (const header of headers) {
    const h = normHeader(header);
    if (wanted.some((w) => w.length > 5 && h.includes(w))) return header;
  }
  return null;
}

const yes = (value: unknown) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  return ["yes", "y", "true", "1", "applicable"].includes(text) ? true : ["no", "n", "false", "0", "not applicable", "na"].includes(text) ? false : null;
};

export interface ParseResult { records: ExtraRecord[]; skipped: number; missingColumns: string[]; matchedColumns: string[] }

/** "Impact assessment", "evaluation", "M&E", "monitoring" -> M&E; anything else (or blank) -> Implementation. */
export function partnerRole(raw: unknown): "Implementation" | "M&E" {
  return typeof raw === "string" && /m\s*&\s*e|monitor|evaluat|impact|assess/i.test(raw) ? "M&E" : "Implementation";
}

export function parseExtra(kind: ExtraKind, tables: SourceTable[]): ParseResult {
  const specs = COLUMNS[kind];
  const records: ExtraRecord[] = [];
  let skipped = 0;
  let best: { missing: string[]; matched: string[] } | null = null;
  for (const table of tables) {
    const columns = new Map(specs.map((spec) => [spec.key, resolve(table.headers, spec)]));
    const missing = specs.filter((spec) => spec.required && !columns.get(spec.key)).map((spec) => spec.header);
    const matched = specs.filter((spec) => columns.get(spec.key)).map((spec) => spec.header);
    if (!best || matched.length > best.matched.length) best = { missing, matched };
    if (missing.length) continue;
    for (const row of table.rows) {
      const record: Record<string, string | number | boolean | null> = {};
      for (const spec of specs) {
        const column = columns.get(spec.key);
        const raw = column ? row[column] : null;
        record[spec.key] =
          spec.type === "amount" ? toAmount(raw)
          : spec.type === "year" ? normaliseYear(raw)
          : spec.type === "yesno" ? yes(raw)
          : cleanText(raw);
      }
      const company = typeof record.company === "string" ? record.company : null;
      const year = typeof record.year === "string" ? record.year : null;
      if (!company || !year || (kind === "partners" && !record.agency)) { skipped += 1; continue; }
      if (kind === "partners" && record.state) record.state = normaliseState(record.state);
      if (kind === "partners") record.role = partnerRole(record.role);
      if (kind === "financials" && record.unspent === null && typeof record.obligation === "number") {
        const spent = typeof record.totalSpent === "number" ? record.totalSpent : null;
        if (spent !== null) record.unspent = Math.max(0, Math.round((record.obligation - spent) * 100) / 100);
      }
      records.push({ ...record, company, year, companyKey: companyMatchKey(company), ownership: ownershipOf(company) } as ExtraRecord);
    }
  }
  return { records, skipped, missingColumns: best?.missing ?? [], matchedColumns: best?.matched ?? [] };
}

export function saveExtra(kind: ExtraKind, fileName: string, records: ExtraRecord[], mode: "replace" | "merge") {
  const existing = mode === "merge" ? readExtra(kind)?.records ?? [] : [];
  const key = (r: ExtraRecord) => kind === "financials"
    ? `${r.companyKey}|${r.year}`
    : `${r.companyKey}|${r.year}|${String(r.project ?? "").toLowerCase()}|${String(r.agency ?? "").toLowerCase()}|${r.amount ?? ""}`;
  const merged = new Map(existing.map((r) => [key(r), r]));
  for (const record of records) merged.set(key(record), record);
  const store: ExtraStore = { kind, uploadedAt: new Date().toISOString(), fileName, records: [...merged.values()] };
  writeExtra(store);
  return store;
}
