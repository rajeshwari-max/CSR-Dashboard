import { NextResponse } from "next/server";

import { CORE_COLUMNS, SECTOR_ALIASES, normaliseYear, resolveColumns } from "@/lib/etl/vocab";
import { buildDataset, isFactTable, type SourceTable } from "@/lib/etl/build";
import { parseCsv, parseXlsx, sectorLookupFrom, selectFactTables } from "@/lib/etl/parse";
import { backupCurrent, persist, readDataset } from "@/lib/etl/store";
import { handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 80 * 1024 * 1024;

/**
 * POST /api/upload
 *   file      CSV or XLSX
 *   mode      "replace" | "merge"
 *   dryRun    "1" to validate + preview without writing
 *
 * Validation runs first and returns a per-check report; nothing is written
 * unless the required columns are present and at least one row survives
 * cleaning. The previous dataset is backed up before any replace/merge.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "replace") === "merge" ? "merge" : "replace";
    const dryRun = String(form.get("dryRun") ?? "") === "1";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received", detail: "Attach a CSV or XLSX file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large", detail: `${(file.size / 1e6).toFixed(1)} MB exceeds the 80 MB limit.` },
        { status: 413 },
      );
    }

    const name = file.name;
    const isCsv = /\.csv$/i.test(name);
    const isExcel = /\.xlsx$|\.xlsm$/i.test(name);
    if (!isCsv && !isExcel) {
      return NextResponse.json(
        { error: "Unsupported file type", detail: "Upload a .csv, .xlsx or .xlsm file." },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let tables: SourceTable[];
    try {
      tables = isCsv ? parseCsv(buffer.toString("utf8")) : await parseXlsx(buffer);
    } catch (error) {
      return NextResponse.json(
        {
          error: "Could not read the file",
          detail: error instanceof Error ? error.message : "The file may be corrupt or password protected.",
        },
        { status: 422 },
      );
    }

    const { facts, others } = selectFactTables(tables);
    const checks: { label: string; status: "ok" | "warn" | "fail"; detail: string }[] = [];

    checks.push({
      label: "File readable",
      status: "ok",
      detail: `${isCsv ? "CSV" : "Excel"} parsed · ${tables.length} sheet${tables.length === 1 ? "" : "s"}`,
    });

    if (!facts.length) {
      const headers = tables[0]?.headers.slice(0, 12).join(", ") ?? "none";
      checks.push({
        label: "Required columns",
        status: "fail",
        detail: `No sheet has both a company column and an amount-spent column. Found: ${headers}`,
      });
      return NextResponse.json({ ok: false, checks, mode }, { status: 422 });
    }

    checks.push({
      label: "Required columns",
      status: "ok",
      detail: `Company + amount spent found in: ${facts.map((table) => table.name).join(", ")}`,
    });

    const sectorNames = new Set(Object.values(SECTOR_ALIASES).map((value) => value.toLowerCase()));
    const sectorLookup = sectorLookupFrom(others, sectorNames);
    const aspirational = new Set<string>();
    for (const table of tables) {
      if (!table.name.toLowerCase().includes("aspiration")) continue;
      const header = table.headers.find((column) => /district/i.test(column));
      if (!header) continue;
      for (const row of table.rows) {
        const value = row[header];
        if (typeof value === "string" && value.trim()) aspirational.add(value.trim().toLowerCase());
      }
    }

    const existing = mode === "merge" ? readDataset() : null;
    if (mode === "merge" && !existing) {
      checks.push({
        label: "Merge target",
        status: "warn",
        detail: "No existing dataset to merge into — this upload will become the dataset.",
      });
    }

    if (mode === "merge" && existing) {
      const uploadedYears = new Set<string>();
      for (const table of facts) {
        const columns = resolveColumns(table.headers, CORE_COLUMNS);
        const sheetYear = normaliseYear(table.name);
        const yearColumn = columns.year;
        for (const row of table.rows) {
          const year = (yearColumn ? normaliseYear(row[yearColumn]) : null) ?? sheetYear;
          if (year) uploadedYears.add(year);
        }
      }
      const existingYears = new Set(existing.dictionaries.years);
      const overlaps = [...uploadedYears].filter((year) => existingYears.has(year)).sort();
      if (overlaps.length) {
        checks.push({
          label: "Financial-year overlap",
          status: "fail",
          detail:
            `${overlaps.join(", ")} already exists. Merge is blocked to prevent double counting. ` +
            "Rebuild and upload one complete canonical dataset when revising an existing year.",
        });
        return NextResponse.json({ ok: false, checks, mode, overlappingYears: overlaps }, { status: 409 });
      }
    }

    const dataset = buildDataset(facts, {
      fileName: name,
      existing,
      aspirational,
      sectorLookup,
    });

    const previousRows = existing?.rows.length ?? 0;
    const added = dataset.rows.length - previousRows;

    if (!dataset.rows.length) {
      checks.push({
        label: "Rows after cleaning",
        status: "fail",
        detail: "Every row was dropped — no company name or no amount in any row.",
      });
      return NextResponse.json({ ok: false, checks, mode }, { status: 422 });
    }

    checks.push({
      label: "Rows after cleaning",
      status: "ok",
      detail: `${dataset.rows.length.toLocaleString("en-IN")} kept${
        mode === "merge" ? ` (${added.toLocaleString("en-IN")} new)` : ""
      } · ${dataset.stats.dropped_no_company.toLocaleString("en-IN")} without a company · ${dataset.stats.dropped_empty.toLocaleString("en-IN")} empty`,
    });
    checks.push({
      label: "Duplicates removed",
      status: dataset.stats.duplicates_removed > 0 ? "warn" : "ok",
      detail: `${dataset.stats.duplicates_removed.toLocaleString("en-IN")} identical rows collapsed`,
    });
    checks.push({
      label: "Financial years detected",
      status: dataset.dictionaries.years.length ? "ok" : "warn",
      detail: dataset.dictionaries.years.length
        ? [...dataset.dictionaries.years].sort().join(", ")
        : "No year column recognised — year filters and trends will be empty.",
    });
    checks.push({
      label: "Sector coverage",
      status: dataset.stats.sector_unknown > dataset.rows.length * 0.3 ? "warn" : "ok",
      detail: `${dataset.stats.sector_unknown.toLocaleString("en-IN")} rows unclassified · ${dataset.stats.sector_backfilled.toLocaleString("en-IN")} backfilled from per-sector sheets`,
    });
    const optional = Object.entries(dataset.capabilities)
      .filter(([, available]) => available)
      .map(([key]) => key);
    checks.push({
      label: "Optional columns",
      status: "ok",
      detail: optional.length ? `Enabled: ${optional.join(", ")}` : "None detected (NGO, beneficiaries, status, dates)",
    });

    // Preview: the largest 25 projects, hydrated for display.
    const preview = [...dataset.rows]
      .sort((a, b) => (b[8] ?? 0) - (a[8] ?? 0))
      .slice(0, 25)
      .map((row) => ({
        company: dataset.dictionaries.companies[row[0]]?.name ?? "—",
        year: row[1] >= 0 ? dataset.dictionaries.years[row[1]] : "—",
        sector: dataset.dictionaries.sectors[row[2]] ?? "—",
        state: dataset.dictionaries.states[row[3]] ?? "—",
        theme: dataset.dictionaries.themes[row[4]] ?? "—",
        project: row[9],
        spent: row[8],
      }));

    const summary = {
      rows: dataset.rows.length,
      addedRows: mode === "merge" ? added : dataset.rows.length,
      companies: dataset.dictionaries.companies.length,
      years: [...dataset.dictionaries.years].sort(),
      states: dataset.dictionaries.states.length,
      sectors: dataset.dictionaries.sectors.length,
      districts: dataset.dictionaries.districts.length,
      totalSpend: Math.round(dataset.rows.reduce((sum, row) => sum + (row[8] ?? 0), 0) * 100) / 100,
      sheets: facts.map((table) => table.name),
    };

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, checks, preview, summary, mode });
    }

    const backup = backupCurrent();
    persist(dataset);

    return NextResponse.json({ ok: true, dryRun: false, checks, preview, summary, mode, backup });
  } catch (error) {
    return handleRouteError(error);
  }
}
