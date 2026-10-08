/**
 * Branded CSR PDF report.
 *
 * Drawn with pdf-lib vector primitives (no headless browser), in the CMS
 * identity: purple #82419A, teal #00B698. Every figure comes from the same
 * summary, breakdown and insight payloads the dashboard renders, so the PDF
 * cannot disagree with the screen it was exported from.
 *
 * Layout works top-down: `ctx.y` is the distance from the top of the page and
 * the helpers convert to pdf-lib's bottom-up coordinates. Shapes are drawn as
 * SVG paths placed at the page's top-left corner, so they use the same
 * top-down coordinates.
 */
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";

import { buildBreakdown, buildSummary, getDataset, selectRows } from "@/lib/dataset";
import { buildInsights } from "@/lib/insights";
import type { Filters, InsightSeverity, NamedValue } from "@/types";

type Tuple = readonly [number, number, number];
type RgbFn = typeof import("pdf-lib").rgb;

const hex = (value: string): Tuple => [
  parseInt(value.slice(1, 3), 16) / 255,
  parseInt(value.slice(3, 5), 16) / 255,
  parseInt(value.slice(5, 7), 16) / 255,
];

const BRAND = {
  purple: hex("#82419A"),
  purpleDeep: hex("#5E2C72"),
  teal: hex("#00B698"),
  ink: hex("#1F1A2E"),
  muted: hex("#6E6880"),
  faint: hex("#9C97A9"),
  rule: hex("#E7E2EE"),
  panel: hex("#F7F4FA"),
  purpleSoft: hex("#F1E8F5"),
  tealSoft: hex("#E3F6F1"),
  white: hex("#FFFFFF"),
  up: hex("#0E8A6A"),
  down: hex("#C2414B"),
  amber: hex("#C9821C"),
};
const CATEGORICAL: Tuple[] = ["#82419A", "#00B698", "#E39B2F", "#3E7CC9", "#D4577B", "#6C5BA8", "#5FC3AE", "#B3AEC0"].map(hex);
const MODE_COLORS: Tuple[] = [BRAND.purple, BRAND.teal, hex("#B3AEC0"), hex("#E39B2F"), hex("#3E7CC9")];

const PAGE = { w: 595.28, h: 841.89 };
const M = 42;
const CW = PAGE.w - M * 2;
const BOTTOM = PAGE.h - 52;

// CMS logo, from public/cms-logo.svg (viewBox 150 x 54).
const LOGO_LETTERS = [
  "M27.2 8.5C12.5 8.5 3 18.2 3 31.2 3 44.6 12.9 52 26.4 52c7.3 0 13-2.2 17.4-6.2l-8.1-9.3c-2.3 2.1-5 3.4-8.7 3.4-5.7 0-9.7-3.5-9.7-9 0-5.7 4-9.4 9.8-9.4 3.4 0 6.1 1.1 8.5 3.2l8.1-9.6c-4.4-4.3-9.8-6.6-16.5-6.6Z",
  "M45.5 9.5h13.2l10.2 17.8L79 9.5h13.2V51H78.6V30.3L69 46.1h-.5l-9.4-15.7V51H45.5V9.5Z",
  "M116.8 8.6c8 0 14.8 2.3 20.2 6.5l-6.7 9.5c-4.4-2.9-9.3-4.4-13.7-4.4-2.5 0-3.7.7-3.7 2 0 1.6 1.5 2.1 7.5 3.5 11 2.5 17.7 6 17.7 13.4 0 8.8-7.3 13.6-19.7 13.6-8.7 0-16.9-2.7-23-7.8l7.4-8.9c5.1 3.6 10.6 5.4 16.1 5.4 2.7 0 4-.7 4-2.1 0-1.6-1.6-2.2-7.9-3.6-10.6-2.4-17.2-5.9-17.2-13.4 0-8.3 6.7-13.7 19-13.7Z",
];
const LOGO_CORNER = "M125 2h22v22L125 2Z";

// ---------------------------------------------------------------------------
// Text safety and formatting
// ---------------------------------------------------------------------------

/** pdf-lib's standard fonts are WinAnsi: no rupee sign, arrows or typographic dashes. */
const PDF_REPLACEMENTS: [RegExp, string][] = [
  [/₹\s?/g, "Rs "], [/[–—]/g, "-"], [/[’‘]/g, "'"], [/[“”]/g, '"'], [/…/g, "..."],
  [/→/g, "->"], [/×/g, "x"], [/≥/g, ">="], [/≤/g, "<="], [/∞/g, "inf"], [/²/g, "2"],
];
export function safe(text: string): string {
  let output = text;
  for (const [pattern, replacement] of PDF_REPLACEMENTS) output = output.replace(pattern, replacement);
  return output.replace(/[^\x20-\xFF]/g, "");
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const INR0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export function crore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Math.abs(value) >= 1000 ? `Rs ${INR0.format(value)} Cr` : `Rs ${INR.format(value)} Cr`;
}
const croreShort = (value: number) =>
  Math.abs(value) >= 100 ? INR0.format(value) : new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const signedPct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value) ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
const sharePct = (value: number | null | undefined) =>
  value === null || value === undefined || Number.isNaN(value) ? "-" : `${(value * 100).toFixed(1)}%`;

/** "Itc Limited" -> "ITC Limited": the source workbook title-cases acronyms. */
export function displayCompanyName(name: string): string {
  return name
    .split(" ")
    .map((word) =>
      /^[a-z]{2,4}$/i.test(word) && !/^(ltd|pvt|and|the|for|of|co|inc|plc|llp)$/i.test(word) && !/[aeiouy]/i.test(word.slice(1))
        ? word.toUpperCase()
        : word,
    )
    .join(" ");
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  pages: PDFPage[];
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  rgb: RgbFn;
  runningTitle: string;
}

const paint = (ctx: Ctx, t: Tuple) => ctx.rgb(t[0], t[1], t[2]);
const mix = (a: Tuple, b: Tuple, t: number): Tuple => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const n = (value: number) => Number(value.toFixed(2));

function fit(value: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(value, size) <= max) return value;
  let cut = value;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

interface TextOptions { size?: number; bold?: boolean; color?: Tuple; align?: "left" | "right" | "center"; maxWidth?: number; opacity?: number }
function text(ctx: Ctx, raw: string, x: number, y: number, options: TextOptions = {}): number {
  const font = options.bold ? ctx.bold : ctx.regular;
  const size = options.size ?? 9;
  let value = safe(raw);
  if (options.maxWidth) value = fit(value, font, size, options.maxWidth);
  const width = font.widthOfTextAtSize(value, size);
  const left = options.align === "right" ? x - width : options.align === "center" ? x - width / 2 : x;
  ctx.page.drawText(value, { x: left, y: PAGE.h - y, size, font, color: paint(ctx, options.color ?? BRAND.ink), opacity: options.opacity });
  return width;
}
const widthOf = (ctx: Ctx, raw: string, size: number, bold = false) => (bold ? ctx.bold : ctx.regular).widthOfTextAtSize(safe(raw), size);

function shape(ctx: Ctx, path: string, fill: Tuple | null, options: { opacity?: number; border?: Tuple; borderWidth?: number; dash?: number[] } = {}) {
  ctx.page.drawSvgPath(path, {
    x: 0,
    y: PAGE.h,
    color: fill ? paint(ctx, fill) : undefined,
    opacity: options.opacity,
    borderColor: options.border ? paint(ctx, options.border) : undefined,
    borderWidth: options.border ? options.borderWidth ?? 0.8 : 0,
    borderDashArray: options.dash,
  });
}
function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: Tuple | null, options: { radius?: number; opacity?: number; border?: Tuple; dash?: number[] } = {}) {
  if (w <= 0 || h <= 0) return;
  const r = Math.min(options.radius ?? 0, w / 2, h / 2);
  const [x0, y0, x1, y1] = [n(x), n(y), n(x + w), n(y + h)];
  const path = r > 0
    ? `M ${n(x0 + r)} ${y0} H ${n(x1 - r)} Q ${x1} ${y0} ${x1} ${n(y0 + r)} V ${n(y1 - r)} Q ${x1} ${y1} ${n(x1 - r)} ${y1} H ${n(x0 + r)} Q ${x0} ${y1} ${x0} ${n(y1 - r)} V ${n(y0 + r)} Q ${x0} ${y0} ${n(x0 + r)} ${y0} Z`
    : `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`;
  shape(ctx, path, fill, { opacity: options.opacity, border: options.border, dash: options.dash });
}
function rule(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, t: Tuple = BRAND.rule, thickness = 0.6, dash?: number[]) {
  ctx.page.drawLine({ start: { x: x1, y: PAGE.h - y1 }, end: { x: x2, y: PAGE.h - y2 }, thickness, color: paint(ctx, t), dashArray: dash });
}
function logo(ctx: Ctx, x: number, y: number, scale: number, letters: Tuple) {
  for (const path of LOGO_LETTERS) ctx.page.drawSvgPath(path, { x, y: PAGE.h - y, scale, color: paint(ctx, letters) });
  ctx.page.drawSvgPath(LOGO_CORNER, { x, y: PAGE.h - y, scale, color: paint(ctx, BRAND.teal) });
}

function wrapLines(ctx: Ctx, raw: string, size: number, maxWidth: number, bold = false): string[] {
  const font = bold ? ctx.bold : ctx.regular;
  const words = safe(raw).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) { lines.push(current); current = word; } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}
function paragraph(ctx: Ctx, raw: string, x: number, y: number, maxWidth: number, options: { size?: number; color?: Tuple; leading?: number; bold?: boolean } = {}): number {
  const size = options.size ?? 9;
  const leading = options.leading ?? size + 4;
  let cursor = y;
  for (const line of wrapLines(ctx, raw, size, maxWidth, options.bold)) {
    text(ctx, line, x, cursor, { size, color: options.color, bold: options.bold });
    cursor += leading;
  }
  return cursor;
}

// ---------------------------------------------------------------------------
// Page flow
// ---------------------------------------------------------------------------

function runningHeader(ctx: Ctx) {
  logo(ctx, M, 22, 0.22, BRAND.purple);
  text(ctx, ctx.runningTitle, PAGE.w - M, 32, { size: 7.5, color: BRAND.muted, align: "right", maxWidth: CW - 60 });
  rule(ctx, M, 42, PAGE.w - M, 42, BRAND.teal, 1.2);
}
function addPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE.w, PAGE.h]);
  ctx.pages.push(ctx.page);
  runningHeader(ctx);
  ctx.y = 64;
}
function ensure(ctx: Ctx, height: number) {
  if (ctx.y + height > BOTTOM) addPage(ctx);
}

/** Section opener: eyebrow, title, one-line takeaway. Keeps itself with `body` height of content. */
function section(ctx: Ctx, eyebrow: string, title: string, takeaway: string | null, body: number) {
  const takeawayLines = takeaway ? wrapLines(ctx, takeaway, 9, CW) : [];
  ensure(ctx, 44 + takeawayLines.length * 13 + body);
  ctx.y += 6;
  text(ctx, eyebrow.toUpperCase(), M, ctx.y, { size: 7.5, bold: true, color: BRAND.teal });
  ctx.y += 17;
  text(ctx, title, M, ctx.y, { size: 14.5, bold: true, color: BRAND.ink });
  ctx.y += 15;
  for (const line of takeawayLines) { text(ctx, line, M, ctx.y, { size: 9, color: BRAND.muted }); ctx.y += 13; }
  ctx.y += 8;
}
function subhead(ctx: Ctx, title: string, note: string | null, body: number) {
  ensure(ctx, 30 + body);
  text(ctx, title, M, ctx.y + 4, { size: 10, bold: true });
  if (note) text(ctx, note, PAGE.w - M, ctx.y + 4, { size: 7.5, color: BRAND.faint, align: "right", maxWidth: CW / 2 });
  ctx.y += 18;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

interface TrendColumn { label: string; value: number; sub: string; delta: number | null; projection?: boolean }

function columnChart(ctx: Ctx, columns: TrendColumn[], height = 170) {
  const top = ctx.y;
  const axisW = 44;
  const plotX = M + axisW;
  const plotW = CW - axisW;
  const plotH = height - 58;
  const base = top + 16 + plotH;
  const max = Math.max(...columns.map((c) => c.value), 1) * 1.12;
  const step = niceStep(max / 4);
  for (let v = 0; v <= max; v += step) {
    const y = base - (v / max) * plotH;
    rule(ctx, plotX, y, PAGE.w - M, y, BRAND.rule, 0.5);
    text(ctx, step >= 1 ? INR0.format(v) : croreShort(v), plotX - 6, y + 3, { size: 7, color: BRAND.faint, align: "right" });
  }
  text(ctx, "Rs Cr", M, top + 6, { size: 7, color: BRAND.faint });
  const slot = plotW / columns.length;
  const barW = Math.min(46, slot * 0.56);
  const realColumns = columns.filter((c) => !c.projection);
  const latest = realColumns[realColumns.length - 1];
  columns.forEach((column, index) => {
    const cx = plotX + slot * index + slot / 2;
    const h = (column.value / max) * plotH;
    if (column.projection) {
      box(ctx, cx - barW / 2, base - h, barW, h, BRAND.white, { radius: 3, border: BRAND.purple, dash: [3, 2] });
    } else {
      box(ctx, cx - barW / 2, base - h, barW, h, column === latest ? BRAND.purple : mix(BRAND.purple, BRAND.white, 0.55), { radius: 3 });
    }
    text(ctx, croreShort(column.value), cx, base - h - 6, { size: 8, bold: true, align: "center", color: column.projection ? BRAND.purple : BRAND.ink });
    text(ctx, column.label, cx, base + 13, { size: 8, align: "center", bold: column === latest });
    text(ctx, column.sub, cx, base + 24, { size: 7, align: "center", color: BRAND.faint });
    if (column.delta !== null) {
      const label = signedPct(column.delta);
      const w = widthOf(ctx, label, 7, true) + 10;
      const tint = column.delta >= 0 ? BRAND.up : BRAND.down;
      box(ctx, cx - w / 2, base + 29, w, 12, mix(tint, BRAND.white, 0.86), { radius: 6 });
      text(ctx, label, cx, base + 38, { size: 7, bold: true, align: "center", color: tint });
    }
  });
  rule(ctx, plotX, base, PAGE.w - M, base, BRAND.faint, 0.8);
  ctx.y = base + 50;
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

function donut(ctx: Ctx, rows: NamedValue[], total: number, centreLabel: string) {
  const height = Math.max(190, rows.length * 20 + 20);
  const top = ctx.y;
  const R = 78;
  const r = 50;
  const cx = M + 96;
  const cy = top + height / 2;
  let angle = 0;
  rows.forEach((row, index) => {
    const sweep = (row.value / total) * Math.PI * 2;
    if (sweep <= 0) return;
    const a0 = angle;
    const a1 = angle + Math.min(sweep, Math.PI * 2 - 0.0001);
    angle += sweep;
    const p = (rad: number, radius: number) => `${n(cx + radius * Math.sin(rad))} ${n(cy - radius * Math.cos(rad))}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const path = `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
    shape(ctx, path, CATEGORICAL[index % CATEGORICAL.length], { border: BRAND.white, borderWidth: 1.2 });
  });
  text(ctx, croreShort(total), cx, cy + 1, { size: 15, bold: true, align: "center" });
  text(ctx, centreLabel, cx, cy + 14, { size: 7.5, color: BRAND.muted, align: "center" });

  const legendX = M + 210;
  const valueX = PAGE.w - M - 46;
  let y = cy - (rows.length * 20) / 2 + 12;
  rows.forEach((row, index) => {
    box(ctx, legendX, y - 8, 9, 9, CATEGORICAL[index % CATEGORICAL.length], { radius: 2 });
    text(ctx, row.name, legendX + 16, y, { size: 8.5, maxWidth: valueX - legendX - 90 });
    text(ctx, croreShort(row.value), valueX, y, { size: 8.5, bold: true, align: "right" });
    text(ctx, sharePct(row.value / total), PAGE.w - M, y, { size: 8.5, color: BRAND.muted, align: "right" });
    y += 20;
  });
  ctx.y = top + height + 6;
}

interface BarRow { label: string; value: number; right: string; tone?: "accent" | "muted" | "grey"; marker?: boolean }
function hbars(ctx: Ctx, rows: BarRow[], options: { labelWidth?: number; rowHeight?: number } = {}) {
  const labelW = options.labelWidth ?? 170;
  const rowH = options.rowHeight ?? 17;
  const rightW = 104;
  const barMax = CW - labelW - rightW - 12;
  const max = Math.max(...rows.map((row) => row.value), 1);
  if (rows.length * rowH < BOTTOM - 64) ensure(ctx, rows.length * rowH);
  for (const row of rows) {
    ensure(ctx, rowH);
    const y = ctx.y;
    text(ctx, row.label, M + labelW - 8, y + 11, { size: 8.5, align: "right", maxWidth: labelW - 14 });
    const w = Math.max(2, (row.value / max) * barMax);
    const fill = row.tone === "accent" ? BRAND.purple : row.tone === "grey" ? hex("#C9C5D3") : mix(BRAND.purple, BRAND.white, 0.5);
    box(ctx, M + labelW, y + 3, w, 10, fill, { radius: 2.5 });
    if (row.marker) {
      const mx = M + labelW + w + 8;
      shape(ctx, `M ${n(mx)} ${n(y + 3)} L ${n(mx + 5)} ${n(y + 8)} L ${n(mx)} ${n(y + 13)} L ${n(mx - 5)} ${n(y + 8)} Z`, BRAND.teal);
    }
    text(ctx, row.right, PAGE.w - M, y + 11, { size: 8, align: "right", color: BRAND.muted });
    ctx.y += rowH;
  }
  ctx.y += 6;
}

function heatmap(ctx: Ctx, series: { name: string; values: Record<string, number> }[], years: string[], base: Tuple) {
  const labelW = 150;
  const totalW = 64;
  const gap = 2;
  const cellW = (CW - labelW - totalW - gap * years.length) / years.length;
  const cellH = 17;
  const max = Math.max(...series.flatMap((s) => years.map((y) => s.values[y] ?? 0)), 1);
  const blockH = 22 + series.length * (cellH + gap);
  ensure(ctx, blockH < BOTTOM - 64 ? blockH : 16 + cellH);
  years.forEach((year, j) => text(ctx, year.replace("FY ", "FY"), M + labelW + j * (cellW + gap) + cellW / 2, ctx.y + 8, { size: 7.5, color: BRAND.muted, align: "center" }));
  text(ctx, "5-yr total", PAGE.w - M, ctx.y + 8, { size: 7.5, color: BRAND.muted, align: "right" });
  ctx.y += 14;
  for (const row of series) {
    ensure(ctx, cellH + gap);
    const y = ctx.y;
    text(ctx, row.name, M + labelW - 8, y + 11.5, { size: 8, align: "right", maxWidth: labelW - 12 });
    let total = 0;
    years.forEach((year, j) => {
      const value = row.values[year] ?? 0;
      total += value;
      const x = M + labelW + j * (cellW + gap);
      if (value <= 0) { box(ctx, x, y, cellW, cellH, BRAND.panel, { radius: 2 }); return; }
      const t = Math.sqrt(value / max);
      box(ctx, x, y, cellW, cellH, mix(BRAND.white, base, 0.12 + 0.88 * t), { radius: 2 });
      text(ctx, croreShort(value), x + cellW / 2, y + 11.5, { size: 7.5, align: "center", color: t > 0.62 ? BRAND.white : BRAND.ink, bold: t > 0.62 });
    });
    text(ctx, croreShort(total), PAGE.w - M, y + 11.5, { size: 8, bold: true, align: "right" });
    ctx.y += cellH + gap;
  }
  ctx.y += 8;
}

function stackedShares(ctx: Ctx, rows: { label: string; parts: { name: string; value: number }[] }[], names: string[]) {
  const labelW = 70;
  const barW = CW - labelW;
  let lx = M + labelW;
  names.forEach((name, index) => {
    box(ctx, lx, ctx.y + 1, 8, 8, MODE_COLORS[index % MODE_COLORS.length], { radius: 2 });
    lx += 14 + text(ctx, name, lx + 13, ctx.y + 8.5, { size: 8, color: BRAND.muted }) + 14;
  });
  ctx.y += 18;
  for (const row of rows) {
    ensure(ctx, 20);
    const total = row.parts.reduce((s, p) => s + p.value, 0) || 1;
    text(ctx, row.label, M, ctx.y + 11, { size: 8.5 });
    let x = M + labelW;
    row.parts.forEach((part) => {
      const index = names.indexOf(part.name);
      const w = (part.value / total) * barW;
      if (w <= 0) return;
      box(ctx, x, ctx.y + 1, w, 14, MODE_COLORS[index % MODE_COLORS.length]);
      if (w > 34) text(ctx, `${Math.round((part.value / total) * 100)}%`, x + w / 2, ctx.y + 11, { size: 7.5, bold: true, align: "center", color: BRAND.white });
      x += w;
    });
    ctx.y += 19;
  }
  ctx.y += 6;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const SEVERITY: Record<InsightSeverity, { label: string; tone: Tuple }> = {
  positive: { label: "POSITIVE", tone: BRAND.up },
  neutral: { label: "NOTE", tone: BRAND.purple },
  warning: { label: "WATCH", tone: BRAND.amber },
  critical: { label: "CRITICAL", tone: BRAND.down },
};

export async function renderPdfReport(filters: Filters, scope: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const data = getDataset();
  const summary = buildSummary(filters, 50);
  const insights = buildInsights(filters, scope);
  const themes = buildBreakdown(filters, "theme");
  const states = buildBreakdown(filters, "state");
  const modes = buildBreakdown(filters, "mode");
  const k = summary.kpis;
  const trend = summary.trend;
  const years = trend.map((point) => point.year);
  const single = k.companyCount === 1 && summary.topCompanies[0];
  const subject = single ? displayCompanyName(summary.topCompanies[0].name) : k.companyCount > 1 ? `${INR0.format(k.companyCount)} companies` : "No matching companies";
  const period = years.length ? (years.length > 1 ? `${years[0]} to ${years[years.length - 1]}` : years[0]) : "No years in view";

  const doc = await PDFDocument.create();
  doc.setTitle(`${subject} - CSR Report`);
  doc.setAuthor("CMS CSR Intelligence");
  doc.setSubject(scope);
  const first = doc.addPage([PAGE.w, PAGE.h]);
  const ctx: Ctx = {
    doc, page: first, pages: [first], y: 0, rgb,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    runningTitle: `${subject} - CSR report - ${period}`,
  };

  // ---- Cover band -------------------------------------------------------
  box(ctx, 0, 0, PAGE.w, 186, BRAND.purple);
  shape(ctx, `M ${n(PAGE.w - 150)} 0 L ${n(PAGE.w)} 0 L ${n(PAGE.w)} 150 Z`, BRAND.teal, { opacity: 0.9 });
  shape(ctx, `M ${n(PAGE.w - 64)} 186 L ${n(PAGE.w)} 122 L ${n(PAGE.w)} 186 Z`, BRAND.purpleDeep, { opacity: 0.6 });
  logo(ctx, M, 26, 0.5, BRAND.white);
  text(ctx, "CSR INTELLIGENCE REPORT", M, 88, { size: 8.5, bold: true, color: hex("#CDEFE6") });
  text(ctx, subject, M, 118, { size: 25, bold: true, color: BRAND.white, maxWidth: CW - 110 });
  text(ctx, scope === subject ? period : `${period}  |  ${scope}`, M, 140, { size: 10, color: BRAND.white, opacity: 0.88, maxWidth: CW - 40 });
  text(
    ctx,
    `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST  |  Source: MCA National CSR Portal filings, dataset built ${data.generatedAt.slice(0, 10)}  |  Amounts in Rs crore`,
    M, 162, { size: 7.5, color: BRAND.white, opacity: 0.72, maxWidth: CW },
  );
  ctx.y = 206;

  // ---- KPI tiles --------------------------------------------------------
  const firstYear = trend[0];
  const lastYear = trend[trend.length - 1];
  const cagr = firstYear && lastYear && trend.length > 1 && firstYear.spend > 0
    ? ((lastYear.spend / firstYear.spend) ** (1 / (trend.length - 1)) - 1) * 100 : null;
  const topMappedState = summary.byState.find((row) => row.name !== "Pan India" && row.name !== "Not Specified");
  const tiles: { label: string; value: string; sub: string; tone?: Tuple }[] = [
    { label: "Total CSR spend", value: crore(k.totalSpend), sub: `${trend.length} financial years` },
    { label: `Spend in ${k.latestYear ?? "latest year"}`, value: crore(k.latestYearSpend), sub: k.yoyGrowthPct === null ? "No prior year in view" : `${signedPct(k.yoyGrowthPct)} vs ${k.previousYear}`, tone: k.yoyGrowthPct === null ? undefined : k.yoyGrowthPct >= 0 ? BRAND.up : BRAND.down },
    { label: "Annual growth (CAGR)", value: signedPct(cagr), sub: firstYear && lastYear ? `${firstYear.year.replace("FY ", "FY")} to ${lastYear.year.replace("FY ", "FY")}` : "-", tone: cagr === null ? undefined : cagr >= 0 ? BRAND.up : BRAND.down },
    single
      ? { label: "Thematic areas", value: INR0.format(k.themeCount), sub: "Schedule VII categories" }
      : { label: "Companies reporting", value: INR0.format(k.companyCount), sub: `Top-10 hold ${sharePct(k.top10Share)}` },
    { label: "Project lines", value: INR0.format(k.projectCount), sub: `Avg ${crore(k.avgProjectSize)} each` },
    { label: "States covered", value: INR0.format(k.stateCount), sub: topMappedState ? `Largest: ${topMappedState.name}` : "-" },
    { label: "Districts named", value: INR0.format(k.districtCount), sub: "in project filings" },
    { label: "Aspirational districts", value: crore(k.aspirationalSpend), sub: `${sharePct(k.aspirationalShare)} of spend` },
  ];
  const tileW = (CW - 3 * 10) / 4;
  const tileH = 66;
  tiles.forEach((tile, index) => {
    const x = M + (index % 4) * (tileW + 10);
    const y = ctx.y + Math.floor(index / 4) * (tileH + 10);
    box(ctx, x, y, tileW, tileH, index === 0 ? BRAND.purpleSoft : BRAND.panel, { radius: 6 });
    text(ctx, tile.label.toUpperCase(), x + 11, y + 16, { size: 6.8, bold: true, color: BRAND.muted, maxWidth: tileW - 20 });
    text(ctx, tile.value, x + 11, y + 39, { size: tile.value.length > 13 ? 13 : 16, bold: true, color: index === 0 ? BRAND.purple : BRAND.ink, maxWidth: tileW - 20 });
    text(ctx, tile.sub, x + 11, y + 55, { size: 7.5, color: tile.tone ?? BRAND.muted, bold: Boolean(tile.tone), maxWidth: tileW - 20 });
  });
  ctx.y += tileH * 2 + 10 + 22;

  // ---- Executive summary + highlights ----------------------------------
  section(ctx, "Overview", "Executive summary", null, 80);
  for (const line of insights.summary) {
    const lines = wrapLines(ctx, line, 9.5, CW - 16);
    ensure(ctx, lines.length * 14);
    box(ctx, M, ctx.y - 6, 5, 5, BRAND.teal, { radius: 1 });
    ctx.y = paragraph(ctx, line, M + 14, ctx.y, CW - 16, { size: 9.5, leading: 14 });
    ctx.y += 3;
  }
  ctx.y += 8;

  const topTheme = summary.byTheme[0];
  const risingTheme = trend.length > 1
    ? themes.rows
      .filter((row) => (row.latest ?? 0) - (row.previous ?? 0) > 0)
      .sort((a, b) => ((b.latest ?? 0) - (b.previous ?? 0)) - ((a.latest ?? 0) - (a.previous ?? 0)))[0]
    : undefined;
  const highlights = [
    topTheme && { eyebrow: "Largest thematic area", title: topTheme.name, body: `${crore(topTheme.value)} - ${sharePct(topTheme.share)} of spend across ${topTheme.count ?? 0} project lines` },
    topMappedState && { eyebrow: "Largest state", title: topMappedState.name, body: `${crore(topMappedState.value)} - ${sharePct(topMappedState.share)} of spend` },
    risingTheme && { eyebrow: `Biggest increase in ${k.latestYear}`, title: risingTheme.name, body: `Up ${crore((risingTheme.latest ?? 0) - (risingTheme.previous ?? 0))}: ${crore(risingTheme.previous)} to ${crore(risingTheme.latest)}` },
  ].filter(Boolean) as { eyebrow: string; title: string; body: string }[];
  if (highlights.length) {
    const cardW = (CW - (highlights.length - 1) * 10) / highlights.length;
    const titleLines = highlights.map((card) => wrapLines(ctx, card.title, 10.5, cardW - 22, true).slice(0, 2));
    const titleRows = Math.max(...titleLines.map((lines) => lines.length));
    const cardH = 62 + (titleRows - 1) * 13;
    ensure(ctx, cardH + 10);
    highlights.forEach((card, index) => {
      const x = M + index * (cardW + 10);
      box(ctx, x, ctx.y, cardW, cardH, BRAND.tealSoft, { radius: 6 });
      text(ctx, card.eyebrow.toUpperCase(), x + 11, ctx.y + 16, { size: 6.8, bold: true, color: BRAND.up, maxWidth: cardW - 20 });
      titleLines[index].forEach((line, j) => text(ctx, line, x + 11, ctx.y + 32 + j * 13, { size: 10.5, bold: true, maxWidth: cardW - 20 }));
      paragraph(ctx, card.body, x + 11, ctx.y + 46 + (titleRows - 1) * 13, cardW - 22, { size: 8, color: BRAND.muted, leading: 11 });
    });
    ctx.y += cardH + 14;
  }

  // ---- Trend ------------------------------------------------------------
  if (trend.length) {
    const columns: TrendColumn[] = trend.map((point, index) => ({
      label: point.year.replace("FY ", "FY"),
      value: point.spend,
      sub: `${INR0.format(point.projects)} projects`,
      delta: index > 0 && trend[index - 1].spend > 0 ? ((point.spend - trend[index - 1].spend) / trend[index - 1].spend) * 100 : null,
    }));
    const forecast = insights.forecast;
    if (forecast.nextYear && forecast.nextYearSpend !== null && trend.length >= 3) {
      columns.push({ label: forecast.nextYear.replace("FY ", "FY"), value: forecast.nextYearSpend, sub: "projection", delta: null, projection: true });
    }
    section(ctx, "Trend", "Year-wise CSR spend",
      `${lastYear.year} closed at ${crore(lastYear.spend)}${k.yoyGrowthPct !== null ? `, ${signedPct(k.yoyGrowthPct)} on the year before` : ""}${cagr !== null ? `; ${signedPct(cagr)} a year on average since ${firstYear.year}` : ""}. The dashed column is a linear projection (R2 ${forecast.r2?.toFixed(2) ?? "-"}), directional only.`,
      150);
    columnChart(ctx, columns, 150);
  }

  // ---- Themes -----------------------------------------------------------
  if (summary.byTheme.length) {
    const slices = summary.byTheme.slice(0, 7).map((row) => ({ ...row }));
    const rest = summary.byTheme.slice(7).reduce((s, row) => s + row.value, 0);
    if (rest > 0) slices.push({ name: `Other (${summary.byTheme.length - 7} categories)`, value: rest });
    const topTwo = summary.byTheme.slice(0, 2);
    section(ctx, "Thematic areas", "Where the money goes",
      `${topTwo.map((row) => `${row.name} (${sharePct(row.share)})`).join(" and ")} lead the portfolio of ${summary.byTheme.length} Schedule VII categories.`,
      200);
    donut(ctx, slices, k.totalSpend, "Rs crore, all years");
    if (years.length > 1) {
      subhead(ctx, "Thematic spend by year", "Rs crore - darker cells = more spend", 22 + Math.min(themes.series.length, 12) * 19);
      heatmap(ctx, themes.series.slice(0, 12), years, BRAND.purple);
    }
  }

  // ---- States -----------------------------------------------------------
  if (summary.byState.length) {
    const unmapped = summary.byState.filter((row) => row.name === "Pan India" || row.name === "Not Specified").reduce((s, row) => s + row.value, 0);
    const mapped = summary.byState.filter((row) => row.name !== "Pan India" && row.name !== "Not Specified");
    const mappedTotal = mapped.reduce((s, row) => s + row.value, 0) || 1;
    const topFive = mapped.slice(0, 5).reduce((s, row) => s + row.value, 0) / mappedTotal;
    section(ctx, "Geography", "State-wise distribution",
      `${topMappedState ? `${topMappedState.name} leads with ${sharePct(topMappedState.share)} of all spend; ` : ""}the top five states take ${sharePct(topFive)} of state-attributed spend. ${unmapped > 0 ? `${crore(unmapped)} is filed as Pan India or without a state.` : ""}`,
      Math.min(summary.byState.length, 15) * 17);
    hbars(ctx, summary.byState.slice(0, 15).map((row, index) => ({
      label: row.name,
      value: row.value,
      right: `${crore(row.value)}  ${sharePct(row.share)}`,
      tone: row.name === "Pan India" || row.name === "Not Specified" ? "grey" : index === 0 || row === topMappedState ? "accent" : "muted",
    })));
    if (years.length > 1) {
      subhead(ctx, "State spend by year", "Rs crore - darker cells = more spend", 22 + Math.min(states.series.length, 12) * 19);
      heatmap(ctx, states.series.slice(0, 12), years, BRAND.teal);
    }
  }

  // ---- Districts --------------------------------------------------------
  const rows = selectRows(filters);
  const districtTotals = new Map<string, { district: string; state: string; value: number; aspirational: boolean }>();
  let namedDistrictSpend = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const value = data.spent[row];
    if (Number.isNaN(value) || data.districtIdx[row] < 0) continue;
    const key = `${data.districtIdx[row]}|${data.stateIdx[row]}`;
    const entry = districtTotals.get(key) ?? { district: data.districts[data.districtIdx[row]], state: data.states[data.stateIdx[row]] ?? "", value: 0, aspirational: false };
    entry.value += value;
    entry.aspirational = entry.aspirational || Boolean(data.aspirational[row]);
    namedDistrictSpend += value;
    districtTotals.set(key, entry);
  }
  const districtRows = [...districtTotals.values()].sort((a, b) => b.value - a.value);
  if (districtRows.length) {
    const shown = districtRows.slice(0, 20);
    const topThree = districtRows.slice(0, 3).reduce((s, row) => s + row.value, 0);
    section(ctx, "Geography", "Top districts",
      `${districtRows.length} districts are named in filings. The top three take ${sharePct(topThree / (k.totalSpend || 1))} of all spend; ${sharePct(1 - namedDistrictSpend / (k.totalSpend || 1))} carries no district. Teal markers flag aspirational districts.`,
      Math.min(shown.length, 12) * 17);
    hbars(ctx, shown.map((row, index) => ({
      label: `${row.district}, ${row.state}`,
      value: row.value,
      right: `${crore(row.value)}  ${sharePct(row.value / (k.totalSpend || 1))}`,
      tone: index < 3 ? "accent" : "muted",
      marker: row.aspirational,
    })), { labelWidth: 190 });
  }

  // ---- Delivery ---------------------------------------------------------
  if (modes.rows.length && years.length) {
    const names = modes.rows.map((row) => row.name);
    const top = modes.rows[0];
    section(ctx, "Delivery", "How projects are implemented",
      `${top.name} carries ${sharePct(top.share)} of spend across the period.`, 30 + years.length * 19);
    stackedShares(ctx, [
      ...years.map((year) => ({ label: year.replace("FY ", "FY"), parts: modes.series.map((s) => ({ name: s.name, value: s.values[year] ?? 0 })) })),
      { label: "All years", parts: modes.rows.map((row) => ({ name: row.name, value: row.value })) },
    ], names);
  }

  const buckets = summary.projectSizeDistribution.filter((bucket) => bucket.projects > 0);
  if (buckets.length > 1) {
    const biggest = [...summary.projectSizeDistribution].sort((a, b) => b.spend - a.spend)[0];
    section(ctx, "Delivery", "Project size profile",
      `Projects of ${safe(biggest.label)} account for ${sharePct(biggest.spend / (k.totalSpend || 1))} of spend.`, 150);
    columnChart(ctx, summary.projectSizeDistribution.map((bucket) => ({
      label: safe(bucket.label),
      value: bucket.spend,
      sub: `${INR0.format(bucket.projects)} projects`,
      delta: null,
    })), 150);
  }

  // ---- Companies / sectors (multi-company views only) -------------------
  if (k.companyCount > 1) {
    section(ctx, "Contributors", "Top companies by CSR spend", `The top 10 companies hold ${sharePct(k.top10Share)} of spend in this view.`, 12 * 17);
    hbars(ctx, summary.topCompanies.slice(0, 15).map((row, index) => ({
      label: displayCompanyName(row.name), value: row.value, right: `${crore(row.value)}  ${sharePct(row.share)}`, tone: index === 0 ? "accent" : "muted",
    })), { labelWidth: 190 });
  }
  if (summary.bySector.length > 1) {
    section(ctx, "Contributors", "Spend by industry sector", null, Math.min(summary.bySector.length, 12) * 17);
    hbars(ctx, summary.bySector.slice(0, 12).map((row, index) => ({
      label: row.name, value: row.value, right: `${crore(row.value)}  ${sharePct(row.share)}`, tone: index === 0 ? "accent" : "muted",
    })));
  }

  // ---- Analysis ---------------------------------------------------------
  if (insights.insights.length) {
    section(ctx, "Analysis", "Key insights", null, 60);
    for (const insight of insights.insights.slice(0, 8)) {
      const detail = wrapLines(ctx, insight.detail, 8.5, CW - 92);
      const titleLines = wrapLines(ctx, insight.title, 9.5, CW - 92, true);
      const h = titleLines.length * 13 + detail.length * 11.5 + 18;
      ensure(ctx, h + 6);
      const meta = SEVERITY[insight.severity] ?? SEVERITY.neutral;
      box(ctx, M, ctx.y, CW, h, BRAND.panel, { radius: 6 });
      const pillW = widthOf(ctx, meta.label, 6.5, true) + 12;
      box(ctx, M + 10, ctx.y + 10, pillW, 12, mix(meta.tone, BRAND.white, 0.84), { radius: 6 });
      text(ctx, meta.label, M + 10 + pillW / 2, ctx.y + 18.5, { size: 6.5, bold: true, color: meta.tone, align: "center" });
      let y = ctx.y + 19;
      for (const line of titleLines) { text(ctx, line, M + 82, y, { size: 9.5, bold: true }); y += 13; }
      for (const line of detail) { text(ctx, line, M + 82, y, { size: 8.5, color: BRAND.muted }); y += 11.5; }
      ctx.y += h + 6;
    }
    ctx.y += 6;
  }

  if (insights.anomalies.length) {
    section(ctx, "Analysis", "Unusual year-on-year moves", "Changes at least two standard deviations from the typical year-on-year change in this view. Check these against the source filing.", 40);
    const cols = [{ label: "Entity", x: M + 8, align: "left" as const }, { label: "Year", x: M + 210, align: "left" as const }, { label: "From", x: M + 360, align: "right" as const }, { label: "To", x: M + 445, align: "right" as const }, { label: "z", x: PAGE.w - M - 8, align: "right" as const }];
    box(ctx, M, ctx.y, CW, 18, BRAND.purpleSoft, { radius: 3 });
    cols.forEach((col) => text(ctx, col.label, col.x, ctx.y + 12, { size: 7.5, bold: true, color: BRAND.purple, align: col.align }));
    ctx.y += 20;
    insights.anomalies.slice(0, 12).forEach((row, index) => {
      ensure(ctx, 17);
      if (index % 2 === 1) box(ctx, M, ctx.y, CW, 17, BRAND.panel);
      const cells = [row.name, row.year, crore(row.expected), crore(row.value), row.zScore.toFixed(1)];
      cells.forEach((cell, j) => text(ctx, cell, cols[j].x, ctx.y + 11.5, { size: 8, align: cols[j].align, maxWidth: j === 0 ? 190 : undefined, color: j === 3 ? (row.direction === "spike" ? BRAND.up : BRAND.down) : BRAND.ink, bold: j === 3 }));
      ctx.y += 17;
    });
    ctx.y += 10;
  }

  // ---- Data notes -------------------------------------------------------
  const notes = [
    ...insights.dataQuality.map((note) => `${note.label}: ${note.value}`),
    "Each project line is filed against one state and district, so geography shows the filed location; multi-state programmes may run more widely than shown.",
    "Spend is the amount reported against project lines. Company totals published in annual reports may also include administrative overheads and impact assessment.",
  ];
  const noteLines = notes.map((note) => wrapLines(ctx, note, 8, CW - 28));
  const notesH = noteLines.reduce((s, lines) => s + lines.length * 11 + 3, 0) + 22;
  section(ctx, "Method", "Data sources and quality notes", null, notesH);
  box(ctx, M, ctx.y, CW, notesH, BRAND.panel, { radius: 6 });
  let ny = ctx.y + 16;
  for (const lines of noteLines) {
    box(ctx, M + 12, ny - 5.5, 4, 4, BRAND.faint, { radius: 1 });
    for (const line of lines) { text(ctx, line, M + 22, ny, { size: 8, color: BRAND.muted }); ny += 11; }
    ny += 3;
  }
  ctx.y += notesH + 8;

  // ---- Footers ----------------------------------------------------------
  ctx.pages.forEach((page, index) => {
    ctx.page = page;
    rule(ctx, M, PAGE.h - 34, PAGE.w - M, PAGE.h - 34, BRAND.rule, 0.6);
    const w = text(ctx, "CMS CSR Intelligence", M, PAGE.h - 21, { size: 7.5, bold: true, color: BRAND.purple });
    text(ctx, `  |  ${subject}  |  ${period}`, M + w, PAGE.h - 21, { size: 7.5, color: BRAND.faint, maxWidth: CW - w - 80 });
    text(ctx, `Page ${index + 1} of ${ctx.pages.length}`, PAGE.w - M, PAGE.h - 21, { size: 7.5, color: BRAND.muted, align: "right" });
  });

  return doc.save();
}
