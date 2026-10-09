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
import { displayCompanyName, renderPdfReport } from "@/lib/reports/pdf-report";
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
  if (filters.companies.length) {
    const data = getDataset();
    const names = filters.companies
      .map((id) => data.companyIdToIndex.get(id))
      .filter((index): index is number => index !== undefined)
      .map((index) => displayCompanyName(data.companies[index].name));
    parts.push(names.length && names.length <= 3 ? names.join(", ") : `${filters.companies.length} companies`);
  }
  if (filters.sectors.length) parts.push(filters.sectors.join(", "));
  if (filters.states.length) parts.push(filters.states.join(", "));
  if (filters.districts.length) parts.push(`${filters.districts.length} districts`);
  if (filters.themes.length) parts.push(filters.themes.join(", "));
  if (filters.modes.length) parts.push(filters.modes.join(", "));
  if (filters.aspirationalOnly) parts.push("aspirational districts only");
  if (filters.minSpend !== null || filters.maxSpend !== null) {
    parts.push(`amount spent ${filters.minSpend ?? 0}–${filters.maxSpend ?? "∞"} Cr`);
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
// PDF — the branded layout lives in ./pdf-report
// ---------------------------------------------------------------------------

export async function buildPdfReport(filters: Filters): Promise<Uint8Array> {
  await loadPdfLib(); // surfaces a missing install as ReportDependencyError
  return renderPdfReport(filters, describeScope(filters));
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
    ["Total CSR spent (INR Cr)", k.totalSpend],
    ["Companies reporting", k.companyCount],
    ["Projects", k.projectCount],
    ["Average amount spent per company (INR Cr)", k.avgSpendPerCompany],
    ["Median amount spent per company (INR Cr)", k.medianSpendPerCompany],
    ["Average project size (INR Cr)", k.avgProjectSize],
    ["Year-on-year growth (%)", k.yoyGrowthPct],
    ["Latest year", k.latestYear],
    ["States covered", k.stateCount],
    ["Districts covered", k.districtCount],
    ["Sectors covered", k.sectorCount],
    ["Top-10 company share (%)", Number((k.top10Share * 100).toFixed(2))],
    ["Aspirational district amount spent (INR Cr)", k.aspirationalSpend],
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
      { header: "Amount spent (INR Cr)", key: "value", width: 16 },
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
    ["Total CSR spent", crore(k.totalSpend), `${INR0.format(k.projectCount)} projects`],
    ["Companies reporting", INR0.format(k.companyCount), `${k.sectorCount} sectors`],
    ["Avg amount spent / company", crore(k.avgSpendPerCompany), `Median ${crore(k.medianSpendPerCompany)}`],
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

  chartSlide("Top companies by CSR spent", summary.topCompanies.slice(0, 10).reverse());
  chartSlide("Amount spent by state", summary.byState.slice(0, 10).reverse());
  chartSlide("Amount spent by sector", summary.bySector.slice(0, 10).reverse());
  chartSlide("Amount spent by Schedule VII category", summary.byTheme.slice(0, 10).reverse());

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
