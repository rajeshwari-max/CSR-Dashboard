"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Treemap,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, colorAt, TOOLTIP_STYLES, xTitle, yTitle } from "@/components/charts/chart-theme";
import { ChartTip } from "@/components/charts2/chart-tooltip";
import { SectorPieChart } from "@/components/charts/sector-pie-chart";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCompact, formatCrore, formatNumber, formatShare, formatSignedPercent, truncate } from "@/lib/format";
import { useFilterStore } from "@/store/filters";
import type { BreakdownResponse, SummaryResponse } from "@/types";

export function SectorAnalysisView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();

  const summary = useApi<SummaryResponse>(`/api/summary?${filterQuery}&top=5`);
  const sectorSeries = useApi<BreakdownResponse>(`/api/breakdown?dimension=sector&${filterQuery}&limit=60`);

  const sectors = React.useMemo(() => summary.data?.bySector ?? [], [summary.data]);
  const themes = React.useMemo(() => summary.data?.byTheme ?? [], [summary.data]);
  const years = React.useMemo(
    () => summary.data?.trend.map((point) => point.year) ?? [],
    [summary.data],
  );

  const trendData = React.useMemo(() => {
    const top = sectors.slice(0, 6).map((row) => row.name);
    const byName = new Map((sectorSeries.data?.series ?? []).map((item) => [item.name, item.values]));
    return years.map((year) => {
      const entry: Record<string, string | number> = { year };
      for (const name of top) entry[name] = byName.get(name)?.[year] ?? 0;
      return entry;
    });
  }, [sectors, sectorSeries.data, years]);

  const growth = React.useMemo(
    () =>
      sectors
        .filter((row) => (row.previous ?? 0) >= 5 && row.yoyGrowthPct !== null)
        .sort((a, b) => (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0)),
    [sectors],
  );
  const growthRows = React.useMemo(() => {
    const up = growth.filter((row) => (row.yoyGrowthPct ?? 0) >= 0).slice(0, 6);
    const down = growth.filter((row) => (row.yoyGrowthPct ?? 0) < 0).slice(-6);
    return [...up, ...down];
  }, [growth]);
  const lastYear = years.at(-1);
  const prevYear = years.at(-2);

  // Funding flow: which Schedule VII categories each top sector funds.
  const flow = React.useMemo(() => {
    const totalTheme = themes.reduce((sum, row) => sum + row.value, 0) || 1;
    return themes.slice(0, 10).map((row) => ({
      name: row.name,
      value: row.value,
      share: row.value / totalTheme,
      count: row.count ?? 0,
    }));
  }, [themes]);

  return (
    <PageFrame
      title="CSR by Sector"
      subtitle={`How CSR spending is split across industry sectors and Schedule VII areas · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      resultCount={summary.data?.filteredRows}
      error={summary.error ?? meta.error}
      onRefresh={() => {
        summary.refetch();
        sectorSeries.refetch();
      }}
      isRefreshing={summary.isValidating}
    >
      <SectionLabel>Sector overview</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="CSR Spent Share by Sector"
          description="Top sectors, remainder grouped"
          height={340}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!sectors.length}
        >
          <SectorPieChart data={sectors} onSelect={(name) => toggleValue("sectors", name)} />
        </ChartCard>

        <ChartCard
          title="Total CSR Spent by Sector and Financial Year"
          description="Top 6 sectors across financial years"
          className="xl:col-span-2"
          height={340}
          isLoading={summary.isLoading || sectorSeries.isLoading}
          error={summary.error}
          isEmpty={!trendData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 18, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" {...AXIS_PROPS} label={xTitle("Financial year", -14)} />
              <YAxis {...AXIS_PROPS} width={64} tickFormatter={(value: number) => formatCompact(value)} label={yTitle("CSR amount spent (₹ crore)")} />
              <Tooltip content={<ChartTip money />} cursor={TOOLTIP_STYLES.cursor} />
              <Legend iconType="circle" iconSize={8} verticalAlign="top" height={30} />
              {sectors.slice(0, 6).map((sector, index) => (
                <Line
                  key={sector.name}
                  type="monotone"
                  dataKey={sector.name}
                  stroke={colorAt(index)}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <SectionLabel>Growth rate</SectionLabel>
      {/* One chart per row: at half width the treemap tiles were too small for readable labels. */}
      <div className="grid grid-cols-1 gap-5">
        <ChartCard
          title={`Which Sectors Raised or Cut CSR Spending${prevYear && lastYear ? `: ${prevYear} → ${lastYear}` : ""}`}
          description={`Green: sectors that spent more on CSR than the year before. Red: sectors that spent less. Shows % change for sectors with at least ₹5 crore spent in ${prevYear ?? "the previous year"}; hover a bar for the ₹ crore amounts.`}
          height={420}
          isLoading={summary.isLoading}
          error={summary.error}
          isEmpty={!growth.length}
          emptyMessage="Needs two financial years with comparable amounts spent."
        >
          <div className="flex h-full flex-col">
            <div className="mb-1 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--c2)" }} /> Spending increased</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--danger)" }} /> Spending decreased</span>
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthRows} layout="vertical" margin={{ top: 4, right: 64, bottom: 20, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" {...AXIS_PROPS} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value}%`} label={xTitle(`Change in CSR spent, ${prevYear ?? "previous FY"} to ${lastYear ?? "latest FY"} (%)`, -14)} />
                  <YAxis type="category" dataKey="name" width={170} {...AXIS_PROPS} tickFormatter={(value: string) => truncate(value, 26)} />
                  <ReferenceLine x={0} stroke="var(--text-soft)" />
                  <Tooltip
                    cursor={TOOLTIP_STYLES.cursor}
                    content={({ payload }) => {
                      const row = payload?.[0]?.payload as (typeof growthRows)[number] | undefined;
                      if (!row) return null;
                      return (
                        <div style={{ ...TOOLTIP_STYLES.contentStyle, padding: "8px 10px" }}>
                          <p style={{ fontWeight: 600, marginBottom: 4 }}>{row.name}</p>
                          <p>{prevYear ?? "Previous FY"}: {formatCrore(row.previous ?? 0)}</p>
                          <p>{lastYear ?? "Latest FY"}: {formatCrore(row.latest ?? 0)}</p>
                          <p style={{ fontWeight: 600, color: (row.yoyGrowthPct ?? 0) >= 0 ? "var(--c2)" : "var(--danger)" }}>
                            {(row.yoyGrowthPct ?? 0) >= 0 ? "Up" : "Down"} {formatCrore(Math.abs((row.latest ?? 0) - (row.previous ?? 0)))} ({formatSignedPercent(row.yoyGrowthPct)})
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="yoyGrowthPct" radius={[0, 5, 5, 0]} maxBarSize={20}>
                    {growthRows.map((row) => (
                      <Cell key={row.name} fill={(row.yoyGrowthPct ?? 0) >= 0 ? "var(--c2)" : "var(--danger)"} />
                    ))}
                    <LabelList dataKey="yoyGrowthPct" position="right" formatter={(value: number) => formatSignedPercent(value)} style={{ fontSize: 11, fill: "var(--text)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>CSR Expenditure Across Schedule VII Thematic Areas</CardTitle>
              <CardDescription>
                {years.length ? `${years[0]} to ${years[years.length - 1]} · All amounts in ₹ crore. ` : ""}
                Explore how corporate CSR expenditure is distributed across Schedule VII thematic areas. Larger blocks represent higher expenditure. Hover over any category to view its total spending, share of expenditure and number of reported projects.
              </CardDescription>
            </div>
            <a href="https://ies.gov.in/arthapedia/concept/corporate-social-responsibility-csr" target="_blank" rel="noreferrer">
              <Badge variant="outline">{themes.length} Schedule VII Categories</Badge>
            </a>
          </CardHeader>
          {themes.length >= 2 ? (
            <div className="grid grid-cols-1 gap-4 px-6 pb-2 sm:grid-cols-3">
              {[
                { label: "Leading category", name: themes[0].name, value: formatCrore(themes[0].value), sub: `${formatShare(themes[0].share)} of total CSR expenditure` },
                { label: "Second highest", name: themes[1].name, value: formatCrore(themes[1].value), sub: `${formatShare(themes[1].share)} of total CSR expenditure` },
                { label: "Categories", name: "Schedule VII areas", value: String(themes.length), sub: "with reported CSR expenditure" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="truncate text-[13.5px] font-semibold" title={item.name}>{item.name}</p>
                  <p className="numeric text-[20px] font-semibold">{item.value}</p>
                  <p className="text-[11.5px] text-muted-foreground">{item.sub}</p>
                </div>
              ))}
            </div>
          ) : null}
          <CardContent className="h-[420px] pb-5">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={flow}
                dataKey="value"
                nameKey="name"
                stroke="var(--surface)"
                content={<FundingTreemapNode selected={filters.themes} />}
                onClick={(node: { name?: string }) => node?.name && toggleValue("themes", node.name)}
              >
                <Tooltip
                  {...TOOLTIP_STYLES}
                  formatter={(value: number, name: string) => {
                    const row = themes.find((item) => item.name === name);
                    return [
                      row ? `${formatCrore(value)} · ${formatShare(row.share)} of total CSR spent · ${formatNumber(row.count ?? 0)} projects` : formatCrore(value),
                      name,
                    ];
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <SectionLabel>Sector drill-down</SectionLabel>
      <SectorDrilldown sectors={sectors.map((row) => row.name).filter((name) => name !== "Unclassified")} filterQuery={filterQuery} />

      <SectionLabel>All sectors</SectionLabel>
      <Card>
        <CardContent className="px-0 pt-4">
          <BreakdownTable
            rows={sectors}
            label="Sector"
            limit={60}
            selected={filters.sectors}
            onSelect={(name) => toggleValue("sectors", name)}
            latestLabel={years[years.length - 1]}
            columns={["value", "share", "count", "companies", "latest", "yoy"]}
          />
        </CardContent>
      </Card>

    </PageFrame>
  );
}

interface FundingNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  value?: number;
  share?: number;
  count?: number;
  depth?: number;
  selected: string[];
}

function FundingTreemapNode({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  name = "",
  value = 0,
  share = 0,
  count = 0,
  depth = 1,
  selected,
}: FundingNodeProps) {
  if (depth !== 1) return null;
  const active = selected.length === 0 || selected.includes(name);
  // Readability: 13px names wrapped over two lines, 12px figures, and a dark
  // halo behind white text so labels stay legible on the light mint and
  // lavender tiles as well as the dark purple ones.
  // Shrink the type (down to 10.5px) before cutting a long word such as
  // "Sustainability" in a narrow tile.
  const longestWord = Math.max(...name.split(" ").map((word) => word.length));
  const fontSize = Math.max(10.5, Math.min(13, (width - 18) / (longestWord * 0.62)));
  const charsPerLine = Math.max(6, Math.floor((width - 18) / (fontSize * 0.6)));
  const lines = wrapLabel(name, charsPerLine, height > 88 ? 3 : 2);
  const showLabel = width > 70 && height > 34;
  const showValue = width > 110 && height > 34 + lines.length * (fontSize + 3) + 16;
  const halo = { stroke: "rgba(24, 10, 34, 0.55)", strokeWidth: 3, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
  return (
    <g className="cursor-pointer">
      <rect
        x={x}
        y={y}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={8}
        fill={colorAt(index)}
        fillOpacity={active ? 0.92 : 0.32}
        stroke={active && selected.includes(name) ? "var(--text)" : "var(--surface)"}
        strokeWidth={active && selected.includes(name) ? 2.5 : 2}
      />
      {showLabel
        ? lines.map((line, lineIndex) => (
            <text key={lineIndex} x={x + 9} y={y + 21 + lineIndex * (fontSize + 3)} fill="#fff" fontSize={fontSize} fontWeight={700} {...halo}>
              {line}
            </text>
          ))
        : null}
      {showValue ? (
        <text x={x + 9} y={y + 23 + lines.length * (fontSize + 3)} fill="#fff" fontSize={Math.min(12, fontSize)} fontWeight={500} {...halo}>
          {formatCrore(value)} · {(share * 100).toFixed(1)}% of total
          {width > 230 ? ` · ${count.toLocaleString("en-IN")} projects` : ""}
        </text>
      ) : null}
    </g>
  );
}

/** Splits a label into at most `maxLines` lines of about `width` characters. */
function wrapLabel(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, width);
    return kept;
  }
  return lines.map((line) => truncate(line, width + 1));
}

/**
 * Drill-down for one sector: which companies make up its CSR spent, and how
 * each company's amount moved year by year. One breakdown call (by company,
 * scoped to the sector) gives both the ranking and the per-year series.
 */
function SectorDrilldown({ sectors, filterQuery }: { sectors: string[]; filterQuery: string }) {
  const [picked, setPicked] = React.useState<string>("");
  const sector = picked && sectors.includes(picked) ? picked : sectors[0] ?? "";
  const query = React.useMemo(() => {
    const params = new URLSearchParams(filterQuery);
    params.delete("sectors");
    if (sector) params.set("sectors", sector);
    return params.toString();
  }, [filterQuery, sector]);
  const drill = useApi<BreakdownResponse>(sector ? `/api/breakdown?dimension=company&limit=30&${query}` : null);
  const byYear = useApi<BreakdownResponse>(sector ? `/api/breakdown?dimension=year&${query}` : null);

  const years = drill.data?.years ?? [];
  const byName = new Map((drill.data?.series ?? []).map((item) => [item.name, item.values]));
  const companies = (drill.data?.rows ?? []).slice(0, 15);
  const yearSpend = new Map((byYear.data?.rows ?? []).map((row) => [row.name, row.value]));
  const yearTotals = years.map((year) => ({ year, spend: yearSpend.get(year) ?? 0 }));
  const max = Math.max(1, ...companies.flatMap((row) => years.map((year) => byName.get(row.name)?.[year] ?? 0)));

  const download = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Company", "Total (₹ crore)", ...years.map((y) => `${y} (₹ crore)`)].map(esc).join(","),
      ...(drill.data?.rows ?? []).slice(0, 30).map((row) =>
        [esc(row.name), String(row.value), ...years.map((y) => String(byName.get(row.name)?.[y] ?? 0))].join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sector-${sector.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-companies-by-year.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Sector Figures by Company and Financial Year</CardTitle>
          <CardDescription>
            Pick a sector to see which companies make up its CSR spent and how each moved year by year (₹ crore). Darker cells are larger amounts.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <select
            value={sector}
            onChange={(event) => setPicked(event.target.value)}
            className="rounded-md border bg-[var(--surface)] px-2.5 py-1.5 text-[13px] font-medium"
            aria-label="Sector"
          >
            {sectors.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={download} disabled={!companies.length}>
            Download
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {drill.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !companies.length ? (
          <p className="text-sm text-muted-foreground">No projects for this sector in the current selection.</p>
        ) : (
          <>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearTotals} margin={{ top: 22, right: 12, bottom: 18, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" {...AXIS_PROPS} label={xTitle("Financial year", -14)} />
                  <YAxis {...AXIS_PROPS} width={64} tickFormatter={(value: number) => formatCompact(value)} label={yTitle("₹ crore")} />
                  <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => [formatCrore(value), `${sector}, all companies`]} />
                  <Bar dataKey="spend" fill="var(--c1)" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    <LabelList dataKey="spend" position="top" formatter={(value: number) => Math.round(value).toLocaleString("en-IN")} style={{ fontSize: 11, fill: "var(--text)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <th className="px-3 py-2 text-left font-semibold">Company</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                    {years.map((year) => (
                      <th key={year} className="px-3 py-2 text-right font-semibold">{year.replace(/^FY\s*/, "FY ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.map((row) => (
                    <tr key={row.name} className="border-t">
                      <td className="max-w-[280px] truncate px-3 py-1.5 font-medium" title={row.name}>{row.name}</td>
                      <td className="numeric px-3 py-1.5 text-right font-semibold">{formatCrore(row.value)}</td>
                      {years.map((year) => {
                        const v = byName.get(row.name)?.[year] ?? 0;
                        const t = v / max;
                        return (
                          <td
                            key={year}
                            className="numeric px-3 py-1.5 text-right"
                            style={v > 0 ? { background: `color-mix(in srgb, var(--c1) ${Math.round(8 + t * 70)}%, transparent)`, color: t > 0.55 ? "#fff" : undefined } : undefined}
                          >
                            {v > 0 ? formatCrore(v) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
