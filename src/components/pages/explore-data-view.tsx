"use client";

import * as React from "react";
import {
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Download } from "lucide-react";

import { IndiaMap } from "@/components/charts/india-map";
import { TOOLTIP_STYLES, AXIS_PROPS } from "@/components/charts/chart-theme";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatSignedPercent } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { BreakdownResponse, Dimension, NamedValue } from "@/types";

/**
 * "Indicator Explorer", modelled on the NITI for States Data Explorer: pick an
 * indicator, then view it four ways — Map, Regional Comparison, Correlation and
 * Make your own report (heat map). Built on the same /api/breakdown group-by as
 * the other pages, so every filter in the bar applies.
 */

type Unit = "state" | "sector" | "theme" | "district";
type View = "map" | "comparison" | "correlation" | "report";
type LabelMode = "all" | "high" | "low";

const UNITS: { key: Unit; label: string; plural: string }[] = [
  { key: "state", label: "State", plural: "States" },
  { key: "district", label: "District", plural: "Districts" },
  { key: "sector", label: "Industry sector", plural: "Sectors" },
  { key: "theme", label: "Schedule VII domain", plural: "Domains" },
];

interface Indicator {
  key: string;
  label: string;
  unit: string;
  format: (value: number) => string;
  /** null = not available for this row */
  get: (row: Row) => number | null;
  stateOnly?: boolean;
}

interface Row extends NamedValue {
  districts?: number;
}

const INDICATORS: Indicator[] = [
  { key: "spend", label: "CSR spent", unit: "₹ crore", format: (v) => formatCrore(v), get: (r) => r.value },
  { key: "projects", label: "CSR projects", unit: "projects", format: (v) => formatNumber(v), get: (r) => r.count ?? 0 },
  { key: "companies", label: "Companies funding", unit: "companies", format: (v) => formatNumber(v), get: (r) => r.companies ?? 0 },
  { key: "avg", label: "Average spent per project", unit: "₹ crore per project", format: (v) => formatCrore(v), get: (r) => (r.count ? r.value / r.count : null) },
  { key: "latest", label: "CSR spent in latest year", unit: "₹ crore", format: (v) => formatCrore(v), get: (r) => r.latest ?? null },
  { key: "yoy", label: "Growth on previous year", unit: "%", format: (v) => formatSignedPercent(v), get: (r) => (typeof r.yoyGrowthPct === "number" ? r.yoyGrowthPct : null) },
  { key: "share", label: "Share of CSR spent", unit: "%", format: (v) => `${v.toFixed(1)}%`, get: (r) => (typeof r.share === "number" ? r.share * 100 : null) },
  { key: "districts", label: "Districts reached", unit: "districts", format: (v) => formatNumber(v), get: (r) => r.districts ?? null, stateOnly: true },
];

const NON_REGION = new Set(["Pan India", "Not Specified", "District Not Classified Elsewhere", "Not Mentioned"]);

function indicatorOf(key: string) {
  return INDICATORS.find((indicator) => indicator.key === key) ?? INDICATORS[0];
}

/** Violet heat ramp (CMS brand) for the report table. */
function heat(t: number) {
  const stops = [
    [244, 237, 247],
    [221, 200, 228],
    [184, 130, 199],
    [130, 65, 154],
    [84, 37, 102],
  ];
  const c = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(c), stops.length - 2);
  const r = c - i;
  const mix = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * r));
  return { background: `rgb(${mix.join(" ")})`, color: t > 0.55 ? "#fff" : "var(--text)" };
}

function pearson(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function strength(r: number) {
  const a = Math.abs(r);
  const word = a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "no clear";
  return `${word}${a >= 0.2 ? (r > 0 ? " positive" : " negative") : ""} relationship`;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border bg-[var(--surface-2)] p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className="rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
          style={value === option.key ? { background: "var(--c1)", color: "#fff" } : { color: "var(--text-soft)" }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Picker({ label, value, options, onChange }: { label: string; value: string; options: { key: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-52 rounded-md border bg-[var(--surface)] px-2.5 py-2 text-[13px] font-medium normal-case tracking-normal text-[var(--text)]">
        {options.map((option) => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ExploreDataView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const [unit, setUnit] = React.useState<Unit>("state");
  const [view, setView] = React.useState<View>("map");
  const [indicatorKey, setIndicatorKey] = React.useState("spend");
  const [xKey, setXKey] = React.useState("projects");
  const [yKey, setYKey] = React.useState("spend");
  const [labels, setLabels] = React.useState<LabelMode>("high");
  const [reportCols, setReportCols] = React.useState<string[]>(["spend", "projects", "companies", "avg", "yoy"]);
  const [reportMode, setReportMode] = React.useState<"indicators" | "years">("indicators");
  const [reportRows, setReportRows] = React.useState(20);

  const dimension: Dimension = unit;
  const breakdown = useApi<BreakdownResponse>(`/api/breakdown?dimension=${dimension}&limit=800&${filterQuery}`);
  // Districts reached per state needs the district breakdown, mapped to states.
  const districtBreakdown = useApi<BreakdownResponse>(unit === "state" ? `/api/breakdown?dimension=district&limit=2000&${filterQuery}` : null);

  const available = React.useMemo(() => INDICATORS.filter((indicator) => !indicator.stateOnly || unit === "state"), [unit]);
  React.useEffect(() => {
    if (!available.some((i) => i.key === indicatorKey)) setIndicatorKey("spend");
    if (!available.some((i) => i.key === xKey)) setXKey("projects");
    if (!available.some((i) => i.key === yKey)) setYKey("spend");
    setReportCols((cols) => cols.filter((c) => available.some((i) => i.key === c)));
  }, [available, indicatorKey, xKey, yKey]);
  React.useEffect(() => {
    if (unit !== "state" && view === "map") setView("comparison");
  }, [unit, view]);

  const rows = React.useMemo<Row[]>(() => {
    const base = (breakdown.data?.rows ?? []).filter((row) => !NON_REGION.has(row.name));
    if (unit !== "state") return base;
    const byState = meta.data?.districtsByState ?? {};
    const stateOfDistrict = new Map<string, string>();
    for (const [state, list] of Object.entries(byState)) for (const d of list) stateOfDistrict.set(d, state);
    const counts = new Map<string, number>();
    for (const d of districtBreakdown.data?.rows ?? []) {
      const state = stateOfDistrict.get(d.name);
      if (state && !NON_REGION.has(d.name)) counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return base.map((row) => ({ ...row, districts: counts.get(row.name) ?? 0 }));
  }, [breakdown.data, districtBreakdown.data, meta.data, unit]);

  const indicator = indicatorOf(indicatorKey);
  const unitInfo = UNITS.find((u) => u.key === unit)!;
  const valued = rows
    .map((row) => ({ row, v: indicator.get(row) }))
    .filter((x): x is { row: Row; v: number } => x.v !== null && Number.isFinite(x.v));
  const sorted = [...valued].sort((a, b) => b.v - a.v);
  const highSet = new Set(sorted.slice(0, 5).map((x) => x.row.name));
  const lowSet = new Set(sorted.slice(-5).map((x) => x.row.name));
  const showLabel = (name: string) => labels === "all" || (labels === "high" ? highSet.has(name) : lowSet.has(name));
  const filterKey = ({ state: "states", district: "districts", sector: "sectors", theme: "themes" } as const)[unit];

  const loading = breakdown.isLoading || meta.isLoading;
  const years = breakdown.data?.years ?? [];

  const downloadCsv = (header: string[], body: (string | number)[][], name: string) => {
    const esc = (v: string | number) => (typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
    const csv = [header.map(esc).join(","), ...body.map((r) => r.map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const viewOptions: { key: View; label: string }[] = [
    ...(unit === "state" ? [{ key: "map" as View, label: "Map" }] : []),
    { key: "comparison", label: "Regional comparison" },
    { key: "correlation", label: "Correlation" },
    { key: "report", label: "Make your own report" },
  ];

  return (
    <PageFrame
      title="Indicator Explorer"
      subtitle={`Pick an indicator and view it four ways · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      error={breakdown.error ?? meta.error}
      onRefresh={() => breakdown.refetch()}
      isRefreshing={breakdown.isValidating}
    >
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <Picker label="Compare by" value={unit} options={UNITS.map((u) => ({ key: u.key, label: u.plural }))} onChange={(v) => setUnit(v as Unit)} />
            {view !== "correlation" && view !== "report" ? (
              <Picker label="Indicator" value={indicatorKey} options={available.map((i) => ({ key: i.key, label: `${i.label} (${i.unit})` }))} onChange={setIndicatorKey} />
            ) : null}
            {view === "correlation" ? (
              <>
                <Picker label="X axis" value={xKey} options={available.map((i) => ({ key: i.key, label: `${i.label} (${i.unit})` }))} onChange={setXKey} />
                <Picker label="Y axis" value={yKey} options={available.map((i) => ({ key: i.key, label: `${i.label} (${i.unit})` }))} onChange={setYKey} />
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visualise by</span>
              <Segmented value={view} options={viewOptions} onChange={setView} />
            </div>
            {view === "comparison" || view === "correlation" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Display labels</span>
                <Segmented value={labels} options={[{ key: "all", label: "All" }, { key: "high", label: "Top 5" }, { key: "low", label: "Bottom 5" }]} onChange={setLabels} />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {view === "map" && unit === "state" ? (
        <>
          <SectionLabel>{indicator.label} by state</SectionLabel>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>{indicator.label} by State</CardTitle>
                  <CardDescription>Darker shading means a higher value ({indicator.unit}). Click a state to filter the dashboard.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="h-[520px]">
                {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
                  <IndiaMap
                    data={valued.map(({ row, v }) => ({ ...row, value: v }))}
                    selected={filters.states}
                    onSelect={(name) => toggleValue("states", name)}
                    formatValue={indicator.key === "spend" ? undefined : indicator.format}
                    metricLabel={indicator.key === "spend" ? undefined : `${indicator.label} (${indicator.unit})`}
                  />
                )}
              </CardContent>
            </Card>
            <RankCard title="Highest" unitLabel={indicator.unit} rows={sorted.slice(0, 8).map((x) => ({ name: x.row.name, value: x.v }))} format={indicator.format} />
          </div>
          <RankCard title="Lowest" unitLabel={indicator.unit} rows={sorted.slice(-8).reverse().map((x) => ({ name: x.row.name, value: x.v }))} format={indicator.format} wide />
        </>
      ) : null}

      {view === "comparison" ? (
        <>
          <SectionLabel>Regional comparison</SectionLabel>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{indicator.label} by {unitInfo.label}</CardTitle>
                <CardDescription>
                  Each box is sized by {indicator.label.toLowerCase()} ({indicator.unit}); bigger boxes are larger values. Click a box to filter the dashboard.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="h-[520px] pb-5">
              {indicator.key === "yoy" ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Growth can be negative, so it cannot be shown as box sizes. Use Correlation or Make your own report for this indicator.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={sorted.slice(0, unit === "district" ? 80 : 60).filter((x) => x.v > 0).map(({ row, v }) => ({ name: row.name, size: v }))}
                    dataKey="size"
                    nameKey="name"
                    stroke="var(--surface)"
                    isAnimationActive={false}
                    content={<CompareNode format={indicator.format} showLabel={showLabel} />}
                    onClick={(node: { name?: string }) => node?.name && toggleValue(filterKey, node.name)}
                  >
                    <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, name: string) => [indicator.format(value), name]} />
                  </Treemap>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {view === "correlation" ? (
        <CorrelationCard
          rows={rows}
          x={indicatorOf(xKey)}
          y={indicatorOf(yKey)}
          unitLabel={unitInfo.plural.toLowerCase()}
          labelMode={labels}
        />
      ) : null}

      {view === "report" ? (
        <>
          <SectionLabel>Make your own report</SectionLabel>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Heat Map: {unitInfo.plural} × {reportMode === "indicators" ? "Indicators" : "Financial Years"}</CardTitle>
                <CardDescription>
                  {reportMode === "indicators"
                    ? "Darker cells are higher within each column. Choose the indicators to compare."
                    : "CSR spent (₹ crore) by financial year; darker cells are higher within each year."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Segmented value={reportMode} options={[{ key: "indicators", label: "Indicators" }, { key: "years", label: "Year by year" }]} onChange={setReportMode} />
                <Picker label="Rows" value={String(reportRows)} options={[10, 20, 36, 60].map((n) => ({ key: String(n), label: `Top ${n} by CSR spent` }))} onChange={(v) => setReportRows(Number(v))} />
              </div>
              {reportMode === "indicators" ? (
                <div className="flex flex-wrap gap-2">
                  {available.map((i) => {
                    const on = reportCols.includes(i.key);
                    return (
                      <button
                        key={i.key}
                        type="button"
                        onClick={() => setReportCols((cols) => (on ? cols.filter((c) => c !== i.key) : [...cols, i.key]))}
                        className="rounded-full border px-3 py-1 text-[12px]"
                        style={on ? { background: "var(--c1)", color: "#fff", borderColor: "var(--c1)" } : undefined}
                      >
                        {i.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <ReportTable
                rows={[...rows].sort((a, b) => b.value - a.value).slice(0, reportRows)}
                mode={reportMode}
                cols={available.filter((i) => reportCols.includes(i.key))}
                years={years}
                series={breakdown.data?.series ?? []}
                unitLabel={unitInfo.label}
                onDownload={downloadCsv}
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      <p className="text-[12px] text-muted-foreground">
        Source: project-wise CSR filings, MCA National CSR Portal (csr.gov.in). Pan-India and unspecified locations are left out of regional views.
      </p>
    </PageFrame>
  );
}

function RankCard({ title, rows, format, unitLabel, wide }: { title: string; rows: { name: string; value: number }[]; format: (v: number) => string; unitLabel: string; wide?: boolean }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title} {wide ? "values" : ""}</CardTitle>
          <CardDescription>{unitLabel}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ol className={wide ? "grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2" : "flex flex-col gap-2"}>
          {rows.map((row, index) => (
            <li key={row.name} className="text-[12.5px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate">{row.name}</span>
                <span className="numeric shrink-0 font-semibold">{format(row.value)}</span>
              </div>
              <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(row.value) / max) * 100)}%`, background: index % 2 ? "var(--c2)" : "var(--c1)" }} />
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

interface CompareNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  size?: number;
  depth?: number;
  format: (v: number) => string;
  showLabel: (name: string) => boolean;
}

function CompareNode({ x = 0, y = 0, width = 0, height = 0, index = 0, name = "", size = 0, depth = 1, format, showLabel }: CompareNodeProps) {
  if (depth !== 1) return null;
  const labelled = showLabel(name) && width > 60 && height > 30;
  const halo = { stroke: "rgba(24, 10, 34, 0.55)", strokeWidth: 3, paintOrder: "stroke" as const };
  return (
    <g className="cursor-pointer">
      <rect x={x} y={y} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={6} fill={index % 2 ? "var(--c2)" : "var(--c1)"} fillOpacity={0.55 + 0.45 * (1 - Math.min(1, index / 30))} stroke="var(--surface)" strokeWidth={2} />
      {labelled ? (
        <>
          <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={650} style={halo}>
            {name.length > Math.floor(width / 7) ? `${name.slice(0, Math.max(3, Math.floor(width / 7) - 1))}…` : name}
          </text>
          {height > 48 ? (
            <text x={x + 8} y={y + 35} fill="#fff" fontSize={11.5} style={halo}>{format(size)}</text>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

function CorrelationCard({ rows, x, y, unitLabel, labelMode }: { rows: Row[]; x: Indicator; y: Indicator; unitLabel: string; labelMode: LabelMode }) {
  const points = rows
    .map((row) => ({ name: row.name, x: x.get(row), y: y.get(row), size: row.value }))
    .filter((p): p is { name: string; x: number; y: number; size: number } => p.x !== null && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y));
  const r = pearson(points);
  const byY = [...points].sort((a, b) => b.y - a.y);
  const high = new Set(byY.slice(0, 5).map((p) => p.name));
  const low = new Set(byY.slice(-5).map((p) => p.name));
  const labelled = points.map((p) => ({ ...p, label: labelMode === "all" || (labelMode === "high" ? high.has(p.name) : low.has(p.name)) ? p.name : "" }));
  return (
    <>
      <SectionLabel>Correlation</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{y.label} vs {x.label}</CardTitle>
            <CardDescription>
              Each dot is one of {points.length} {unitLabel}; dot size shows CSR spent.{" "}
              {r !== null ? <>Correlation r = <strong>{r.toFixed(2)}</strong>, a {strength(r)}.</> : "Not enough points to measure a relationship."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="h-[520px] pb-5">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name={x.label} {...AXIS_PROPS} tickFormatter={(v: number) => x.format(v)} label={{ value: `${x.label} (${x.unit})`, position: "insideBottom", offset: -16, style: { fontSize: 11, fill: "var(--text-soft)" } }} />
              <YAxis type="number" dataKey="y" name={y.label} {...AXIS_PROPS} width={78} tickFormatter={(v: number) => y.format(v)} label={{ value: `${y.label} (${y.unit})`, angle: -90, position: "insideLeft", offset: -12, style: { fontSize: 11, fill: "var(--text-soft)" } }} />
              <ZAxis type="number" dataKey="size" range={[40, 420]} />
              <Tooltip
                {...TOOLTIP_STYLES}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as { name: string; x: number; y: number } | undefined;
                  if (!p) return null;
                  return (
                    <div style={{ ...TOOLTIP_STYLES.contentStyle, padding: "8px 10px" }}>
                      <p style={{ fontWeight: 600 }}>{p.name}</p>
                      <p>{x.label}: {x.format(p.x)}</p>
                      <p>{y.label}: {y.format(p.y)}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={labelled} fill="var(--c1)" fillOpacity={0.75} stroke="var(--c2)">
                <LabelList dataKey="label" position="top" style={{ fontSize: 10.5, fill: "var(--text)" }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}

function ReportTable({
  rows,
  mode,
  cols,
  years,
  series,
  unitLabel,
  onDownload,
}: {
  rows: Row[];
  mode: "indicators" | "years";
  cols: Indicator[];
  years: string[];
  series: { name: string; values: Record<string, number> }[];
  unitLabel: string;
  onDownload: (header: string[], body: (string | number)[][], name: string) => void;
}) {
  const seriesBy = new Map(series.map((s) => [s.name, s.values]));
  const columns: { label: string; get: (row: Row) => number | null; format: (v: number) => string }[] =
    mode === "indicators"
      ? cols.map((c) => ({ label: `${c.label} (${c.unit})`, get: c.get, format: c.format }))
      : years.map((year) => ({ label: year, get: (row: Row) => seriesBy.get(row.name)?.[year] ?? null, format: (v: number) => formatCrore(v) }));
  const ranges = columns.map((col) => {
    const vals = rows.map((r) => col.get(r)).filter((v): v is number => v !== null && Number.isFinite(v));
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });
  const hasSeries = mode === "years" && rows.some((r) => seriesBy.has(r.name));

  if (!columns.length) return <p className="text-sm text-muted-foreground">Choose at least one indicator.</p>;
  if (mode === "years" && !hasSeries) return <p className="text-sm text-muted-foreground">Year-by-year values are available for the top 30 rows only; reduce the rows or pick Indicators.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            onDownload(
              [unitLabel, ...columns.map((c) => c.label)],
              rows.map((row) => [row.name, ...columns.map((c) => {
                const v = c.get(row);
                return v === null ? "" : Math.round(v * 100) / 100;
              })]),
              `csr-report-${mode}.csv`,
            )
          }
        >
          <Download width={13} height={13} /> Download CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="sticky left-0 px-3 py-2 text-left font-semibold" style={{ background: "var(--surface-2)" }}>{unitLabel}</th>
              {columns.map((col) => (
                <th key={col.label} className="px-3 py-2 text-right font-semibold">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t">
                <td className="sticky left-0 max-w-[240px] truncate px-3 py-1.5 font-medium" style={{ background: "var(--surface)" }}>{row.name}</td>
                {columns.map((col, index) => {
                  const v = col.get(row);
                  const { min, max } = ranges[index];
                  const t = v === null || max === min ? 0 : (v - min) / (max - min);
                  return (
                    <td key={col.label} className="numeric px-3 py-1.5 text-right" style={v === null ? undefined : heat(t)}>
                      {v === null ? "—" : col.format(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Colour scale runs from lightest (lowest) to darkest violet (highest) within each column.</p>
    </div>
  );
}
