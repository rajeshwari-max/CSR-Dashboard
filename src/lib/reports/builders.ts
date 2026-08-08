/**
 * Report generators — PDF, Excel and PowerPoint.
 *
 * All three honour the caller's current filters and are built from the same
 * summary/insight payloads the dashboard renders, so a downloaded report can
 * never disagree with the screen it came from.
 *
 * The PDF is drawn with pdf-lib (vector text + rectangles) rather than a
 * headless browser: no Chromium dependency, ~100 ms, and it works unchanged on
 * a serverless host.
 */

import type { PDFDocument as PDFDocumentType, PDFFont, PDFPage } from "pdf-lib";
import type ExcelJSType from "exceljs";


import {
  buildCsv,
  buildSummary,
  CSV_HEADERS,
  getDataset,
  hydrateRow,
  rowToCsvValues,
  selectSortedRows,
} from "@/lib/dataset";
import { buildInsights } from "@/lib/insights";
import type { Filters, NamedValue } from "@/types";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const INR0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function crore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.abs(value) >= 1000 ? `Rs ${INR0.format(value)} Cr` : `Rs ${INR.format(value)} Cr`;
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function share(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function describeScope(filters: Filters): string {
  const parts: string[] = [];
  if (filters.years.length) parts.push(filters.years.join(", "));
  if (filters.companies.length) parts.push(`${filters.companies.length} companies`);
  if (filters.sectors.length) parts.push(filters.sectors.join(", "));
  if (filters.states.length) parts.push(filters.states.join(", "));
  if (filters.districts.length) parts.push(`${filters.districts.length} districts`);
  if (filters.themes.length) parts.push(filters.themes.join(", "));
  if (filters.modes.length) parts.push(filters.modes.join(", "));
  if (filters.aspirationalOnly) parts.push("aspirational districts only");
  if (filters.minSpend !== null || filters.maxSpend !== null) {
    parts.push(`spend ${filters.minSpend ?? 0}–${filters.maxSpend ?? "∞"} Cr`);
  }
  if (filters.search.trim()) parts.push(`search "${filters.search.trim()}"`);
  return parts.length ? parts.join(" · ") : "All companies, all years, all states";
}

export function reportStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The document libraries are heavy and only needed when someone actually asks
 * for a report, so they are imported on demand. Loading them lazily also means
 * a missing install produces an actionable message instead of taking the whole
 * route module down at import time.
 */
export class ReportDependencyError extends Error {
  packageName: string;
  constructor(packageName: string, cause: unknown) {
    super(
      `The "${packageName}" package is not installed. Run "npm install" in the project ` +
        `folder (it was added for report generation) and restart the dev server.`,
    );
    this.name = "ReportDependencyError";
    this.packageName = packageName;
    this.cause = cause;
  }
}

async function loadExcelJs() {
  try {
    return (await import("exceljs")).default as unknown as typeof ExcelJSType;
  } catch (error) {
    throw new ReportDependencyError("exceljs", error);
  }
}

async function loadPdfLib() {
  try {
    return await import("pdf-lib");
  } catch (error) {
    throw new ReportDependencyError("pdf-lib", error);
  }
}

async function loadPptxGen() {
  try {
    return (await import("pptxgenjs")).default;
  } catch (error) {
    throw new ReportDependencyError("pptxgenjs", error);
  }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * pdf-lib's standard fonts are WinAnsi-encoded, which cannot represent the
 * rupee sign or typographic dashes/quotes. Everything drawn into the PDF goes
 * through here first so a stray ₹ can't 500 the whole report.
 */
const PDF_REPLACEMENTS: [RegExp, string][] = [
  [/₹\s?/g, "Rs "],
  [/[–—]/g, "-"],
  [/[’‘]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, "..."],
  [/→/g, "->"],
  [/×/g, "x"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/∞/g, "inf"],
  [/²/g, "2"],
  [/·/g, "-"],
];

function safe(text: string): string {
  let output = text;
  for (const [pattern, replacement] of PDF_REPLACEMENTS) output = output.replace(pattern, replacement);
  // Anything still outside Latin-1 would throw at draw time.
  return output.replace(/[^\x20-\xFF]/g, "");
}

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait
const MARGIN = 48;

/** RGB tuples; converted with pdf-lib's `rgb()` once the module is loaded. */
const COLORS = {
  ink: [0.09, 0.13, 0.24],
  muted: [0.42, 0.47, 0.56],
  accent: [0.31, 0.35, 0.85],
  rule: [0.85, 0.88, 0.93],
  white: [1, 1, 1],
  coverSub: [0.78, 0.82, 0.92],
  coverMeta: [0.65, 0.7, 0.85],
} as const;

type Rgb = ReturnType<typeof import("pdf-lib").rgb>;
let INK: Rgb;
let MUTED: Rgb;
let ACCENT: Rgb;
let RULE: Rgb;

interface PdfContext {
  doc: PDFDocumentType;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pageNumber: number;
}

function newPage(ctx: PdfContext) {
  ctx.page = ctx.doc.addPage([PAGE.width, PAGE.height]);
  ctx.pageNumber += 1;
  ctx.y = PAGE.height - MARGIN;
  ctx.page.drawText(safe(`CMS CSR Intelligence · page ${ctx.pageNumber}`), {
    x: MARGIN,
    y: 24,
    size: 8,
    font: ctx.regular,
    color: MUTED,
  });
}

function ensure(ctx: PdfContext, needed: number) {
  if (ctx.y - needed < MARGIN + 24) newPage(ctx);
}

/** Naive width-aware wrap — pdf-lib has no layout engine. */
function wrap(rawText: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(rawText).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function heading(ctx: PdfContext, text: string) {
  ensure(ctx, 40);
  ctx.y -= 10;
  ctx.page.drawText(safe(text).toUpperCase(), {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: ctx.bold,
    color: ACCENT,
  });
  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE.width - MARGIN, y: ctx.y },
    thickness: 0.7,
    color: RULE,
  });
  ctx.y -= 14;
}

function paragraph(ctx: PdfContext, text: string, size = 9.5, color?: Rgb) {
  const fill = color ?? INK;
  const lines = wrap(text, ctx.regular, size, PAGE.width - MARGIN * 2);
  for (const line of lines) {
    ensure(ctx, size + 5);
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size, font: ctx.regular, color: fill });
    ctx.y -= size + 4;
  }
  ctx.y -= 4;
}

function table(
  ctx: PdfContext,
  columns: { label: string; width: number; align?: "left" | "right" }[],
  rows: string[][],
) {
  const size = 8.5;
  ensure(ctx, 30);
  let x = MARGIN;
  for (const column of columns) {
    const label = safe(column.label);
    const width = ctx.bold.widthOfTextAtSize(label, size);
    ctx.page.drawText(label, {
      x: column.align === "right" ? x + column.width - width : x,
      y: ctx.y,
      size,
      font: ctx.bold,
      color: MUTED,
    });
    x += column.width;
  }
  ctx.y -= 5;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE.width - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: RULE,
  });
  ctx.y -= 12;

  for (const row of rows) {
    ensure(ctx, 16);
    x = MARGIN;
    row.forEach((cell, index) => {
      const column = columns[index];
      const clean = safe(cell);
      const maxChars = Math.floor(column.width / (size * 0.5));
      const text = clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}...` : clean;
      const width = ctx.regular.widthOfTextAtSize(text, size);
      ctx.page.drawText(text, {
        x: column.align === "right" ? x + column.width - width : x,
        y: ctx.y,
        size,
        font: ctx.regular,
        color: INK,
      });
      x += column.width;
    });
    ctx.y -= 13;
  }
  ctx.y -= 6;
}

/** Horizontal bar chart drawn as vector rectangles. */
function barChart(ctx: PdfContext, rows: NamedValue[], valueLabel: (row: NamedValue) => string) {
  const size = 8.5;
  const labelWidth = 150;
  const barMax = PAGE.width - MARGIN * 2 - labelWidth - 90;
  const peak = rows.reduce((max, row) => Math.max(max, row.value), 0) || 1;

  for (const row of rows) {
    ensure(ctx, 18);
    const cleanName = safe(row.name);
    const label = cleanName.length > 30 ? `${cleanName.slice(0, 29)}...` : cleanName;
    ctx.page.drawText(label, { x: MARGIN, y: ctx.y, size, font: ctx.regular, color: INK });
    const width = Math.max(1.5, (row.value / peak) * barMax);
    ctx.page.drawRectangle({
      x: MARGIN + labelWidth,
      y: ctx.y - 2,
      width,
      height: 8,
      color: ACCENT,
      opacity: 0.85,
    });
    const value = safe(valueLabel(row));
    ctx.page.drawText(value, {
      x: PAGE.width - MARGIN - ctx.regular.widthOfTextAtSize(value, size),
      y: ctx.y,
      size,
      font: ctx.regular,
      color: MUTED,
    });
    ctx.y -= 15;
  }
  ctx.y -= 6;
}

export async function buildPdfReport(filters: Filters): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  INK = rgb(...COLORS.ink);
  MUTED = rgb(...COLORS.muted);
  ACCENT = rgb(...COLORS.accent);
  RULE = rgb(...COLORS.rule);

  const data = getDataset();
  const summary = buildSummary(filters, 15);
  const scope = describeScope(filters);
  const insights = buildInsights(filters, scope);

  const doc = await PDFDocument.create();
  const ctx: PdfContext = {
    doc,
    page: doc.addPage([PAGE.width, PAGE.height]),
    y: PAGE.height - MARGIN,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    pageNumber: 1,
  };
  doc.setTitle("CSR Intelligence Report");
  doc.setAuthor("CMS CSR Intelligence");
  doc.setSubject(scope);

  ctx.page.drawText(safe("CMS CSR Intelligence · page 1"), {
    x: MARGIN, y: 24, size: 8, font: ctx.regular, color: MUTED,
  });

  // ---- cover block
  ctx.page.drawRectangle({
    x: 0, y: PAGE.height - 132, width: PAGE.width, height: 132, color: INK,
  });
  ctx.page.drawText("CSR Intelligence Report", {
    x: MARGIN, y: PAGE.height - 66, size: 22, font: ctx.bold, color: rgb(1, 1, 1),
  });
  ctx.page.drawText(safe(scope).slice(0, 95), {
    x: MARGIN, y: PAGE.height - 88, size: 10, font: ctx.regular, color: rgb(...COLORS.coverSub),
  });
  ctx.page.drawText(
    safe(`Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · dataset built ${data.generatedAt.slice(0, 10)}`),
    { x: MARGIN, y: PAGE.height - 106, size: 8.5, font: ctx.regular, color: rgb(...COLORS.coverMeta) },
  );
  ctx.y = PAGE.height - 160;

  // ---- KPIs
  heading(ctx, "Key performance indicators");
  const k = summary.kpis;
  const kpiRows: [string, string][] = [
    ["Total CSR spend", crore(k.totalSpend)],
    ["Companies reporting", INR0.format(k.companyCount)],
    ["Projects", INR0.format(k.projectCount)],
    ["Average spend / company", crore(k.avgSpendPerCompany)],
    ["Median spend / company", crore(k.medianSpendPerCompany)],
    ["Year-on-year growth", pct(k.yoyGrowthPct)],
    ["States covered", String(k.stateCount)],
    ["Districts covered", INR0.format(k.districtCount)],
    ["Top-10 concentration", share(k.top10Share)],
    ["Aspirational-district spend", `${crore(k.aspirationalSpend)} (${share(k.aspirationalShare)})`],
  ];
  const half = Math.ceil(kpiRows.length / 2);
  for (let i = 0; i < half; i += 1) {
    ensure(ctx, 16);
    const left = kpiRows[i];
    const right = kpiRows[i + half];
    ctx.page.drawText(safe(left[0]), { x: MARGIN, y: ctx.y, size: 9, font: ctx.regular, color: MUTED });
    ctx.page.drawText(safe(left[1]), { x: MARGIN + 150, y: ctx.y, size: 9, font: ctx.bold, color: INK });
    if (right) {
      ctx.page.drawText(safe(right[0]), { x: MARGIN + 270, y: ctx.y, size: 9, font: ctx.regular, color: MUTED });
      ctx.page.drawText(safe(right[1]), { x: MARGIN + 420, y: ctx.y, size: 9, font: ctx.bold, color: INK });
    }
    ctx.y -= 15;
  }
  ctx.y -= 6;

  // ---- narrative
  heading(ctx, "Executive summary");
  for (const line of insights.summary) paragraph(ctx, line);

  // ---- trend
  heading(ctx, "Year-wise trend");
  table(
    ctx,
    [
      { label: "Financial year", width: 120 },
      { label: "Spend", width: 110, align: "right" },
      { label: "Projects", width: 90, align: "right" },
      { label: "Companies", width: 90, align: "right" },
      { label: "YoY", width: 79, align: "right" },
    ],
    summary.trend.map((point, index) => {
      const previous = index > 0 ? summary.trend[index - 1].spend : null;
      const growth = previous && previous > 0 ? ((point.spend - previous) / previous) * 100 : null;
      return [
        point.year,
        crore(point.spend),
        INR0.format(point.projects),
        INR0.format(point.companies),
        growth === null ? "—" : pct(growth),
      ];
    }),
  );

  // ---- charts
  heading(ctx, "Top companies by CSR spend");
  barChart(ctx, summary.topCompanies.slice(0, 12), (row) => `${crore(row.value)}  ${share(row.share)}`);

  heading(ctx, "Spend by state");
  barChart(ctx, summary.byState.slice(0, 12), (row) => `${crore(row.value)}  ${share(row.share)}`);

  heading(ctx, "Spend by sector");
  barChart(ctx, summary.bySector.slice(0, 10), (row) => `${crore(row.value)}  ${share(row.share)}`);

  heading(ctx, "Spend by Schedule VII category");
  barChart(ctx, summary.byTheme.slice(0, 10), (row) => `${crore(row.value)}  ${share(row.share)}`);

  // ---- insights
  heading(ctx, "Analysis");
  for (const insight of insights.insights.slice(0, 8)) {
    ensure(ctx, 44);
    ctx.page.drawText(safe(insight.title), { x: MARGIN, y: ctx.y, size: 9.5, font: ctx.bold, color: INK });
    ctx.y -= 13;
    paragraph(ctx, insight.detail, 8.5, MUTED);
  }

  if (insights.anomalies.length) {
    heading(ctx, "Anomalies (z-score >= 2 on year-on-year change)");
    table(
      ctx,
      [
        { label: "Entity", width: 190 },
        { label: "Year", width: 80 },
        { label: "From", width: 90, align: "right" },
        { label: "To", width: 90, align: "right" },
        { label: "z", width: 39, align: "right" },
      ],
      insights.anomalies.map((row) => [
        row.name,
        row.year,
        crore(row.expected),
        crore(row.value),
        row.zScore.toFixed(1),
      ]),
    );
  }

  heading(ctx, "Data quality notes");
  for (const note of insights.dataQuality) paragraph(ctx, `${note.label}: ${note.value}`, 8.5, MUTED);

  return doc.save();
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

export async function buildExcelReport(filters: Filters, rowLimit = 60_000): Promise<Buffer> {
  const ExcelJS = await loadExcelJs();
  const data = getDataset();
  const summary = buildSummary(filters, 50);
  const scope = describeScope(filters);
  const insights = buildInsights(filters, scope);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CMS CSR Intelligence";
  workbook.created = new Date();

  const header = (sheet: ExcelJSType.Worksheet, columns: Partial<ExcelJSType.Column>[]) => {
    sheet.columns = columns;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    sheet.getRow(1).height = 20;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Summary
  const overview = workbook.addWorksheet("Summary");
  overview.columns = [{ width: 34 }, { width: 26 }, { width: 60 }];
  overview.addRow(["CSR Intelligence Report"]).font = { bold: true, size: 16 };
  overview.addRow(["Scope", scope]);
  overview.addRow(["Generated", new Date().toISOString()]);
  overview.addRow(["Dataset built", data.generatedAt]);
  overview.addRow(["Sources", data.sources.map((s) => `${s.file} (${s.sheets.join(", ")})`).join("; ")]);
  overview.addRow([]);
  overview.addRow(["Key performance indicators"]).font = { bold: true, size: 12 };
  const k = summary.kpis;
  ([
    ["Total CSR spend (INR Cr)", k.totalSpend],
    ["Companies reporting", k.companyCount],
    ["Projects", k.projectCount],
    ["Average spend per company (INR Cr)", k.avgSpendPerCompany],
    ["Median spend per company (INR Cr)", k.medianSpendPerCompany],
    ["Average project size (INR Cr)", k.avgProjectSize],
    ["Year-on-year growth (%)", k.yoyGrowthPct],
    ["Latest year", k.latestYear],
    ["States covered", k.stateCount],
    ["Districts covered", k.districtCount],
    ["Sectors covered", k.sectorCount],
    ["Top-10 company share (%)", Number((k.top10Share * 100).toFixed(2))],
    ["Aspirational district spend (INR Cr)", k.aspirationalSpend],
  ] as [string, string | number | null][]).forEach((row) => overview.addRow(row));
  overview.addRow([]);
  overview.addRow(["Executive summary"]).font = { bold: true, size: 12 };
  insights.summary.forEach((line) => overview.addRow(["", "", line]));
  overview.addRow([]);
  overview.addRow(["Data quality"]).font = { bold: true, size: 12 };
  insights.dataQuality.forEach((note) => overview.addRow([note.label, "", note.value]));

  // Trend
  const trend = workbook.addWorksheet("Trend");
  header(trend, [
    { header: "Financial Year", key: "year", width: 18 },
    { header: "Amount Spent (INR Cr)", key: "spend", width: 22 },
    { header: "Projects", key: "projects", width: 14 },
    { header: "Companies", key: "companies", width: 14 },
    { header: "YoY Growth (%)", key: "growth", width: 16 },
  ]);
  summary.trend.forEach((point, index) => {
    const previous = index > 0 ? summary.trend[index - 1].spend : null;
    trend.addRow({
      year: point.year,
      spend: point.spend,
      projects: point.projects,
      companies: point.companies,
      growth: previous && previous > 0 ? Number((((point.spend - previous) / previous) * 100).toFixed(2)) : null,
    });
  });

  // Breakdown sheets
  const breakdowns: [string, NamedValue[]][] = [
    ["Companies", summary.topCompanies],
    ["States", summary.byState],
    ["Sectors", summary.bySector],
    ["Categories", summary.byTheme],
    ["Implementation", summary.byMode],
    ["Districts", summary.byDistrict],
  ];
  for (const [name, rows] of breakdowns) {
    const sheet = workbook.addWorksheet(name);
    header(sheet, [
      { header: name === "Companies" ? "Company" : name.replace(/s$/, ""), key: "name", width: 42 },
      { header: "Spend (INR Cr)", key: "value", width: 16 },
      { header: "Share of view (%)", key: "share", width: 18 },
      { header: "Projects", key: "count", width: 12 },
      { header: "Companies", key: "companies", width: 12 },
      { header: "Latest FY (INR Cr)", key: "latest", width: 18 },
      { header: "Previous FY (INR Cr)", key: "previous", width: 19 },
      { header: "YoY (%)", key: "yoy", width: 12 },
    ]);
    rows.forEach((row) =>
      sheet.addRow({
        name: row.name,
        value: row.value,
        share: Number(((row.share ?? 0) * 100).toFixed(2)),
        count: row.count ?? 0,
        companies: row.companies ?? 0,
        latest: row.latest ?? 0,
        previous: row.previous ?? 0,
        yoy: row.yoyGrowthPct,
      }),
    );
  }

  // Anomalies
  if (insights.anomalies.length) {
    const sheet = workbook.addWorksheet("Anomalies");
    header(sheet, [
      { header: "Entity", key: "name", width: 42 },
      { header: "Year", key: "year", width: 14 },
      { header: "Previous (INR Cr)", key: "expected", width: 18 },
      { header: "Actual (INR Cr)", key: "value", width: 18 },
      { header: "Change (%)", key: "deviation", width: 14 },
      { header: "z-score", key: "z", width: 10 },
      { header: "Direction", key: "direction", width: 12 },
    ]);
    insights.anomalies.forEach((row) =>
      sheet.addRow({
        name: row.name,
        year: row.year,
        expected: row.expected,
        value: row.value,
        deviation: row.deviationPct,
        z: row.zScore,
        direction: row.direction,
      }),
    );
  }

  // Full register
  const register = workbook.addWorksheet("Project Register");
  header(
    register,
    CSV_HEADERS.map((label) => ({
      header: label,
      width: label.includes("Project") && !label.includes("Outlay") ? 60 : label.length + 8,
    })),
  );
  const rows = selectSortedRows(filters, "spent", "desc").subarray(0, rowLimit);
  for (let i = 0; i < rows.length; i += 1) {
    const row = hydrateRow(rows[i]);
    const cin = data.companies[data.companyIdx[rows[i]]]?.cin ?? "";
    register.addRow(rowToCsvValues(row, cin));
  }
  register.autoFilter = { from: "A1", to: { row: 1, column: CSV_HEADERS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// PowerPoint
// ---------------------------------------------------------------------------

export async function buildPptxReport(filters: Filters): Promise<Buffer> {
  const PptxGenJS = await loadPptxGen();
  const summary = buildSummary(filters, 10);
  const scope = describeScope(filters);
  const insights = buildInsights(filters, scope);
  const k = summary.kpis;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "CMS CSR Intelligence";
  pptx.title = "CSR Intelligence Review";

  const NAVY = "1E293B";
  const INDIGO = "4F46E5";
  const SLATE = "64748B";

  // Title
  const title = pptx.addSlide();
  title.background = { color: NAVY };
  title.addText("CSR Intelligence Review", {
    x: 0.6, y: 1.7, w: 11, h: 0.9, fontSize: 40, bold: true, color: "FFFFFF",
  });
  title.addText(scope, { x: 0.6, y: 2.6, w: 11, h: 0.5, fontSize: 16, color: "C7D2FE" });
  title.addText(
    `Generated ${new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })} · all amounts INR Crore`,
    { x: 0.6, y: 3.1, w: 11, h: 0.4, fontSize: 12, color: "94A3B8" },
  );

  // KPIs
  const kpiSlide = pptx.addSlide();
  kpiSlide.addText("Key performance indicators", {
    x: 0.5, y: 0.35, w: 11, h: 0.5, fontSize: 24, bold: true, color: NAVY,
  });
  const cards: [string, string, string][] = [
    ["Total CSR spend", crore(k.totalSpend), `${INR0.format(k.projectCount)} projects`],
    ["Companies reporting", INR0.format(k.companyCount), `${k.sectorCount} sectors`],
    ["Avg spend / company", crore(k.avgSpendPerCompany), `Median ${crore(k.medianSpendPerCompany)}`],
    ["Year-on-year growth", pct(k.yoyGrowthPct), `${k.previousYear ?? "—"} → ${k.latestYear ?? "—"}`],
    ["States covered", String(k.stateCount), `${INR0.format(k.districtCount)} districts`],
    ["Top-10 concentration", share(k.top10Share), "Share held by 10 largest filers"],
  ];
  cards.forEach((card, index) => {
    const x = 0.5 + (index % 3) * 4.1;
    const y = 1.15 + Math.floor(index / 3) * 2.3;
    kpiSlide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.8, h: 2, fill: { color: "F1F5F9" }, line: { color: "E2E8F0" }, rectRadius: 0.1,
    });
    kpiSlide.addText(card[0].toUpperCase(), { x: x + 0.25, y: y + 0.2, w: 3.3, h: 0.3, fontSize: 10, color: SLATE, bold: true });
    kpiSlide.addText(card[1], { x: x + 0.25, y: y + 0.6, w: 3.3, h: 0.6, fontSize: 26, bold: true, color: NAVY });
    kpiSlide.addText(card[2], { x: x + 0.25, y: y + 1.3, w: 3.3, h: 0.4, fontSize: 11, color: SLATE });
  });

  // Trend chart
  const trendSlide = pptx.addSlide();
  trendSlide.addText("Year-wise CSR trend", { x: 0.5, y: 0.35, w: 11, h: 0.5, fontSize: 24, bold: true, color: NAVY });
  trendSlide.addChart(pptx.ChartType.bar, [
    {
      name: "Amount spent (INR Cr)",
      labels: summary.trend.map((point) => point.year),
      values: summary.trend.map((point) => point.spend),
    },
  ], { x: 0.5, y: 1.1, w: 7.6, h: 5, showValue: true, chartColors: [INDIGO], catAxisLabelFontSize: 11 });
  trendSlide.addText(
    summary.trend
      .map((point) => `${point.year}: ${crore(point.spend)} · ${INR0.format(point.projects)} projects · ${point.companies} companies`)
      .join("\n"),
    { x: 8.3, y: 1.3, w: 4.2, h: 4, fontSize: 12, color: NAVY, lineSpacingMultiple: 1.6 },
  );

  const chartSlide = (heading: string, rows: NamedValue[]) => {
    const slide = pptx.addSlide();
    slide.addText(heading, { x: 0.5, y: 0.35, w: 11, h: 0.5, fontSize: 24, bold: true, color: NAVY });
    slide.addChart(pptx.ChartType.bar, [
      {
        name: "INR Cr",
        labels: rows.map((row) => (row.name.length > 26 ? `${row.name.slice(0, 25)}…` : row.name)),
        values: rows.map((row) => row.value),
      },
    ], {
      x: 0.5, y: 1.1, w: 12.2, h: 5.6, barDir: "bar", showValue: true,
      chartColors: [INDIGO], catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
    });
    return slide;
  };

  chartSlide("Top companies by CSR spend", summary.topCompanies.slice(0, 10).reverse());
  chartSlide("Spend by state", summary.byState.slice(0, 10).reverse());
  chartSlide("Spend by sector", summary.bySector.slice(0, 10).reverse());
  chartSlide("Spend by Schedule VII category", summary.byTheme.slice(0, 10).reverse());

  // Insights
  const insightSlide = pptx.addSlide();
  insightSlide.addText("What the data says", { x: 0.5, y: 0.35, w: 11, h: 0.5, fontSize: 24, bold: true, color: NAVY });
  insightSlide.addText(
    insights.insights.slice(0, 6).map((insight) => ({
      text: `${insight.title}\n`,
      options: { fontSize: 14, bold: true, color: NAVY, breakLine: true },
    })).flatMap((item, index) => [
      item,
      {
        text: `${insights.insights[index].detail}\n`,
        options: { fontSize: 11, color: SLATE, breakLine: true },
      },
    ]),
    { x: 0.5, y: 1.1, w: 12.2, h: 5.6, lineSpacingMultiple: 1.15 },
  );

  // Recommendations + caveats
  const closing = pptx.addSlide();
  closing.addText("Recommendations", { x: 0.5, y: 0.35, w: 11, h: 0.5, fontSize: 24, bold: true, color: NAVY });
  closing.addText(
    (insights.recommendations.length
      ? insights.recommendations
      : [{ title: "No material issues detected in this view", detail: "", impact: "" }]
    ).map((item) => ({
      text: `${item.title}${item.detail ? ` — ${item.detail}` : ""}\n`,
      options: { fontSize: 12, color: NAVY, bullet: true, breakLine: true },
    })),
    { x: 0.5, y: 1.1, w: 12.2, h: 2.8 },
  );
  closing.addText("Data caveats", { x: 0.5, y: 4.1, w: 11, h: 0.4, fontSize: 16, bold: true, color: NAVY });
  closing.addText(
    insights.dataQuality
      .filter((note) => note.severity === "warning")
      .map((note) => ({
        text: `${note.label}: ${note.value}\n`,
        options: { fontSize: 11, color: SLATE, bullet: true, breakLine: true },
      })),
    { x: 0.5, y: 4.5, w: 12.2, h: 2 },
  );

  const output = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return output;
}

export function buildCsvReport(filters: Filters): string {
  return buildCsv(filters, "spent", "desc");
}
