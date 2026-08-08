/** Reads an uploaded CSV or XLSX buffer into plain header/row tables. */

import { isFactTable, type SourceTable } from "@/lib/etl/build";

/** Minimal RFC-4180 CSV reader — handles quotes, embedded commas and newlines. */
export function parseCsv(text: string): SourceTable[] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1)
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? null;
      });
      return record;
    });

  return [{ name: "CSV", headers, rows: records }];
}

/**
 * XLSX via exceljs (already a dependency for report export). Every sheet is
 * returned; the builder decides which are fact-shaped.
 */
export async function parseXlsx(buffer: Buffer): Promise<SourceTable[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const tables: SourceTable[] = [];
  workbook.eachSheet((sheet) => {
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
      const value = cell.value;
      headers[index - 1] = value === null || value === undefined ? `Unnamed: ${index - 1}` : String(value).trim();
    });
    if (!headers.length) return;

    const rows: Record<string, unknown>[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, unknown> = {};
      let hasValue = false;
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        let value = cell.value as unknown;
        // Formulas and rich text arrive as objects; take the computed text.
        if (value && typeof value === "object") {
          const object = value as { result?: unknown; text?: unknown; richText?: { text: string }[] };
          if (object.result !== undefined) value = object.result;
          else if (object.text !== undefined) value = object.text;
          else if (object.richText) value = object.richText.map((part) => part.text).join("");
          else if (value instanceof Date) value = value.toISOString();
          else value = String(value);
        }
        if (value !== null && value !== undefined && value !== "") hasValue = true;
        record[header] = value ?? null;
      });
      if (hasValue) rows.push(record);
    });

    tables.push({ name: sheet.name, headers, rows });
  });

  return tables;
}

/**
 * Sheet selection mirrors the Python pipeline: ingest the biggest fact-shaped
 * sheet plus any fact-shaped sheet named after a financial year. Per-sector
 * sheets are skipped as facts (they mirror the main register) but are handed
 * back separately so the sector lookup can still be rebuilt from them.
 */
export function selectFactTables(tables: SourceTable[]) {
  const facts = tables.filter((table) => isFactTable(table.headers));
  if (!facts.length) return { facts: [] as SourceTable[], others: tables };

  const sorted = [...facts].sort((a, b) => b.rows.length - a.rows.length);
  const chosen = new Set<string>([sorted[0].name]);
  for (const table of facts) {
    if (/(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})/.test(table.name.replace(/FY/gi, " "))) {
      chosen.add(table.name);
    }
  }
  return {
    facts: facts.filter((table) => chosen.has(table.name)),
    others: tables.filter((table) => !chosen.has(table.name)),
  };
}

/** Company -> sector map rebuilt from per-sector sheets, as in the CLI ETL. */
export function sectorLookupFrom(tables: SourceTable[], sectorNames: Set<string>) {
  const lookup = new Map<string, string>();
  for (const table of tables) {
    const sector = table.name.trim();
    if (!sectorNames.has(sector.toLowerCase())) continue;
    const header = table.headers.find((name) => name.toLowerCase().includes("company"));
    if (!header) continue;
    for (const row of table.rows) {
      const value = row[header];
      if (typeof value === "string" && value.trim().length > 2) {
        const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!lookup.has(key)) lookup.set(key, sector);
      }
    }
  }
  return lookup;
}
