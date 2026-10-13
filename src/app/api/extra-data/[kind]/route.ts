import { NextResponse } from "next/server";

import { COLUMNS, EXTRA_KINDS, parseExtra, saveExtra, type ExtraKind } from "@/lib/extra-data";
import { parseCsv, parseXlsx } from "@/lib/etl/parse";
import { handleRouteError } from "../../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TITLES: Record<ExtraKind, string> = {
  financials: "CSR financials (unspent CSR, impact assessment)",
  partners: "Implementing partners (NGOs)",
};

function kindOf(raw: string): ExtraKind | null {
  return EXTRA_KINDS.includes(raw as ExtraKind) ? (raw as ExtraKind) : null;
}

/** GET /api/extra-data/financials|partners — the Excel template to fill. */
export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const kind = kindOf((await context.params).kind);
    if (!kind) return NextResponse.json({ error: "Unknown data type" }, { status: 404 });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CMS CSR Intelligence";
    const sheet = workbook.addWorksheet(kind === "financials" ? "Financials" : "Partners");
    sheet.columns = COLUMNS[kind].map((spec) => ({ header: spec.header, key: spec.key, width: Math.max(16, spec.header.length + 2) }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF82419A" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.addRow(kind === "financials"
      ? { company: "Example Industries Limited", year: "FY 2023-24", obligation: 12.5, projects: 11.2, overheads: 0.55, impact: 0.2, totalSpent: 11.95, unspent: 0.55, toUnspentAccount: 0.55, toScheduleVIIFund: 0, impactApplicable: "Yes", impactReport: "https://example.com/impact-assessment.pdf", source: "https://example.com/annual-report-2024.pdf" }
      : { company: "Example Industries Limited", year: "FY 2023-24", project: "School nutrition programme", state: "Bihar", district: "Gaya", agency: "Example Foundation", role: "Implementation", registration: "CSR00012345", amount: 1.25 });
    sheet.getRow(2).font = { italic: true, color: { argb: "FF6E6880" } };
    const help = workbook.addWorksheet("How to fill");
    help.columns = [{ header: "Column", key: "column", width: 44 }, { header: "Required", key: "required", width: 10 }, { header: "Notes", key: "note", width: 70 }];
    help.getRow(1).font = { bold: true };
    help.addRow({ column: "Source", required: "", note: "Each company's annual report, Annexure on CSR activities (format under the CSR Amendment Rules, 2021). Replace the example row with real data; one row per company per year" + (kind === "partners" ? " per project." : ".") });
    for (const spec of COLUMNS[kind]) help.addRow({ column: spec.header, required: spec.required ? "Yes" : "", note: spec.note });
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="cms-csr-${kind}-template.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/extra-data/financials|partners — upload a filled template (mode=replace|merge, dryRun=1). */
export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const kind = kindOf((await context.params).kind);
    if (!kind) return NextResponse.json({ error: "Unknown data type" }, { status: 404 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file received", detail: "Attach the filled template." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large", detail: "Keep the file under 20 MB." }, { status: 413 });
    const mode = String(form.get("mode") ?? "merge") === "replace" ? "replace" : "merge";
    const buffer = Buffer.from(await file.arrayBuffer());
    const tables = /\.csv$/i.test(file.name) ? parseCsv(buffer.toString("utf8")) : await parseXlsx(buffer);
    const result = parseExtra(kind, tables);
    // The template's example row should never become data.
    const records = result.records.filter((r) => !/^example industries/i.test(r.company));
    if (result.missingColumns.length) {
      return NextResponse.json({ error: "Required columns missing", detail: `Add: ${result.missingColumns.join(", ")}. Download the template for the expected headers.` }, { status: 422 });
    }
    if (!records.length) {
      return NextResponse.json({ error: "No rows to import", detail: "Every row was empty or missing the company, year" + (kind === "partners" ? " or agency name." : ".") }, { status: 422 });
    }
    if (String(form.get("dryRun") ?? "") === "1") {
      return NextResponse.json({ ok: true, dryRun: true, title: TITLES[kind], rows: records.length, skipped: result.skipped, matchedColumns: result.matchedColumns });
    }
    const store = saveExtra(kind, file.name, records, mode);
    return NextResponse.json({ ok: true, title: TITLES[kind], imported: records.length, skipped: result.skipped, total: store.records.length, mode });
  } catch (error) {
    return handleRouteError(error);
  }
}
