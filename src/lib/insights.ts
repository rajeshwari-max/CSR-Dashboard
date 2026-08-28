/**
 * Deterministic insight + forecast engine.
 *
 * Everything on the AI Insights page is computed here from the fact table:
 * ordinary least squares for the trend/forecast, z-scores for anomalies,
 * concentration ratios and coverage gaps for the narrative cards.
 *
 * The point of doing it this way rather than asking a model to "analyse the
 * data" is that every sentence is reconstructable from the evidence chips
 * attached to it, and the whole thing runs in single-digit milliseconds. An
 * LLM (see lib/llm.ts) can optionally narrate these facts, but it never
 * invents them.
 */

import { buildSummary, getDataset, groupBy, round, selectRows } from "@/lib/dataset";
import type {
  AnomalyRow,
  Filters,
  ForecastPoint,
  Insight,
  InsightsResponse,
  NamedValue,
  TrendPoint,
} from "@/types";

const CRORE = (value: number) =>
  Math.abs(value) >= 1000
    ? `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)} Cr`
    : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} Cr`;

const PCT = (value: number, digits = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
const SHARE = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Financial-year label arithmetic: "FY 2022-23" + 1 -> "FY 2023-24". */
export function nextFinancialYear(label: string): string | null {
  const match = /(\d{4})-(\d{2})/.exec(label);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10) + 1;
  const end = (start + 1) % 100;
  return `FY ${start}-${String(end).padStart(2, "0")}`;
}

/** Ordinary least squares on (index, value) pairs. */
function linearFit(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  values.forEach((value, index) => {
    sxy += (index - meanX) * (value - meanY);
    sxx += (index - meanX) ** 2;
    syy += (value - meanY) ** 2;
  });

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  return { slope, intercept, r2 };
}

export function buildForecast(trend: TrendPoint[]) {
  const spends = trend.map((point) => point.spend);
  const { slope, intercept, r2 } = linearFit(spends);

  // Residual standard deviation -> a crude but honest confidence band.
  const residuals = spends.map((value, index) => value - (intercept + slope * index));
  const sd =
    residuals.length > 2
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / (residuals.length - 2))
      : Math.abs(slope) * 0.5;

  const points: ForecastPoint[] = trend.map((point) => ({
    year: point.year,
    spend: point.spend,
    projected: null,
    lower: null,
    upper: null,
  }));

  const lastYear = trend.length ? trend[trend.length - 1].year : null;
  const nextYear = lastYear ? nextFinancialYear(lastYear) : null;
  let nextYearSpend: number | null = null;

  if (nextYear && trend.length >= 2) {
    const projected = Math.max(0, intercept + slope * trend.length);
    nextYearSpend = round(projected);
    // Anchor the fitted value on the last actual so the line is continuous.
    points[points.length - 1] = { ...points[points.length - 1], projected: trend[trend.length - 1].spend };
    points.push({
      year: nextYear,
      spend: null,
      projected: round(projected),
      lower: round(Math.max(0, projected - 1.96 * sd)),
      upper: round(projected + 1.96 * sd),
    });
  }

  return {
    points,
    method:
      trend.length >= 3
        ? "Ordinary least squares on annual totals"
        : "Linear extrapolation (fewer than 3 years of history)",
    caveat:
      trend.length < 4
        ? `Only ${trend.length} year${trend.length === 1 ? "" : "s"} of data — treat the projection as directional, not a budget figure.`
        : "Projection assumes the historical linear trend continues and no structural change in reporting.",
    r2: trend.length >= 2 ? round(r2, 3) : null,
    nextYear,
    nextYearSpend,
  };
}

/** Year-on-year z-score outliers within a dimension. */
function findAnomalies(rows: Int32Array, dimension: "company" | "state" | "sector"): AnomalyRow[] {
  const data = getDataset();
  const grouped = groupBy(rows, dimension);
  const years = grouped.series.length ? Object.keys(grouped.series[0].values) : [];
  if (years.length < 2) return [];

  const changes: { entry: NamedValue; year: string; value: number; expected: number; delta: number }[] = [];
  const seriesByName = new Map(grouped.series.map((item) => [item.name, item.values]));

  for (const entry of grouped.rows) {
    // Only judge entities big enough for a swing to be meaningful.
    if (entry.value < 5) continue;
    const values = seriesByName.get(entry.name);
    if (!values) continue;
    for (let i = 1; i < years.length; i += 1) {
      const previous = values[years[i - 1]] ?? 0;
      const current = values[years[i]] ?? 0;
      if (previous < 1) continue;
      changes.push({
        entry,
        year: years[i],
        value: current,
        expected: previous,
        delta: (current - previous) / previous,
      });
    }
  }

  if (changes.length < 8) return [];
  const deltas = changes.map((change) => change.delta);
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const sd = Math.sqrt(deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deltas.length) || 1;

  return changes
    .map((change) => ({
      name: change.entry.name,
      id: change.entry.id,
      year: change.year,
      value: round(change.value),
      expected: round(change.expected),
      deviationPct: round(change.delta * 100),
      zScore: round((change.delta - mean) / sd, 2),
      direction: (change.delta >= 0 ? "spike" : "drop") as "spike" | "drop",
    }))
    .filter((row) => Math.abs(row.zScore) >= 2)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, 12);
}

function herfindahl(rows: NamedValue[], total: number): number {
  if (total <= 0) return 0;
  return rows.reduce((sum, row) => sum + (row.value / total) ** 2, 0);
}

export function buildInsights(filters: Filters, scopeLabel: string): Omit<InsightsResponse, "llm"> {
  const data = getDataset();
  const rows = selectRows(filters);
  const summary = buildSummary(filters, 25);
  const { kpis, trend } = summary;
  const forecast = buildForecast(trend);
  const insights: Insight[] = [];

  // ---- 1. Trend ----------------------------------------------------------
  if (trend.length >= 2 && kpis.yoyGrowthPct !== null) {
    const direction = kpis.yoyGrowthPct >= 0 ? "rose" : "fell";
    const severity = kpis.yoyGrowthPct >= 0 ? "positive" : "warning";
    insights.push({
      id: "trend-yoy",
      kind: "trend",
      severity,
      title: `CSR spend ${direction} ${PCT(kpis.yoyGrowthPct)} in ${kpis.latestYear}`,
      detail:
        `Reported spend moved from ${CRORE(trend[trend.length - 2].spend)} in ${kpis.previousYear} to ` +
        `${CRORE(trend[trend.length - 1].spend)} in ${kpis.latestYear}, across ` +
        `${trend[trend.length - 1].companies.toLocaleString("en-IN")} reporting companies.`,
      evidence: [
        { label: kpis.previousYear ?? "prev", value: CRORE(trend[trend.length - 2].spend) },
        { label: kpis.latestYear ?? "latest", value: CRORE(trend[trend.length - 1].spend) },
        { label: "Change", value: PCT(kpis.yoyGrowthPct) },
      ],
    });
  }

  // ---- 2. Reporting participation ---------------------------------------
  if (trend.length >= 2) {
    const latest = trend[trend.length - 1];
    const first = trend[0];
    const delta = latest.companies - first.companies;
    if (Math.abs(delta) >= 5) {
      insights.push({
        id: "trend-participation",
        kind: "quality",
        severity: delta < 0 ? "warning" : "neutral",
        title: `${Math.abs(delta)} ${delta < 0 ? "fewer" : "more"} companies reported in ${latest.year} than ${first.year}`,
        detail:
          delta < 0
            ? `Reporting coverage narrowed from ${first.companies} to ${latest.companies} companies. Year-on-year totals are therefore not strictly like-for-like — part of any decline may be missing disclosures rather than reduced spending.`
            : `Coverage widened from ${first.companies} to ${latest.companies} companies, so part of the growth reflects better disclosure capture.`,
        evidence: [
          { label: first.year, value: `${first.companies} companies` },
          { label: latest.year, value: `${latest.companies} companies` },
          { label: "Projects", value: `${first.projects.toLocaleString("en-IN")} → ${latest.projects.toLocaleString("en-IN")}` },
        ],
      });
    }
  }

  // ---- 3. Concentration --------------------------------------------------
  if (summary.topCompanies.length >= 10) {
    const hhi = herfindahl(summary.topCompanies, kpis.totalSpend);
    insights.push({
      id: "concentration-companies",
      kind: "concentration",
      severity: kpis.top10Share > 0.35 ? "warning" : "neutral",
      title: `Top 10 companies account for ${SHARE(kpis.top10Share)} of spend`,
      detail:
        `${summary.topCompanies[0].name} alone contributes ${SHARE(summary.topCompanies[0].share ?? 0)} ` +
        `(${CRORE(summary.topCompanies[0].value)}). Aggregate trends are therefore sensitive to a handful of large filers.`,
      evidence: [
        { label: "Largest filer", value: summary.topCompanies[0].name },
        { label: "Its share", value: SHARE(summary.topCompanies[0].share ?? 0) },
        { label: "Top-10 share", value: SHARE(kpis.top10Share) },
        { label: "HHI (top 25)", value: hhi.toFixed(3) },
      ],
      action: { label: `Filter to ${summary.topCompanies[0].name}`, filters: { companies: [summary.topCompanies[0].id ?? ""] } },
    });
  }

  // ---- 4. Geographic concentration + gaps --------------------------------
  const mappedStates = summary.byState.filter(
    (row) => row.name !== "Pan India" && row.name !== "Not Specified",
  );
  if (mappedStates.length) {
    const top5 = mappedStates.slice(0, 5).reduce((sum, row) => sum + row.value, 0);
    const stateTotal = mappedStates.reduce((sum, row) => sum + row.value, 0);
    insights.push({
      id: "concentration-states",
      kind: "concentration",
      severity: top5 / stateTotal > 0.5 ? "warning" : "neutral",
      title: `${mappedStates[0].name} leads with ${CRORE(mappedStates[0].value)} of state-attributed spend`,
      detail:
        `The top five states take ${SHARE(top5 / stateTotal)} of all state-attributed spend, while the bottom ` +
        `${mappedStates.slice(-5).length} states receive ${SHARE(mappedStates.slice(-5).reduce((sum, row) => sum + row.value, 0) / stateTotal)} between them.`,
      evidence: [
        { label: "Top state", value: `${mappedStates[0].name} · ${CRORE(mappedStates[0].value)}` },
        { label: "Top-5 share", value: SHARE(top5 / stateTotal) },
        { label: "Smallest", value: `${mappedStates[mappedStates.length - 1].name} · ${CRORE(mappedStates[mappedStates.length - 1].value)}` },
      ],
      action: { label: `Filter to ${mappedStates[0].name}`, filters: { states: [mappedStates[0].name] } },
    });
  }

  // ---- 5. Unattributed spend --------------------------------------------
  const panIndia = summary.byState.find((row) => row.name === "Pan India");
  const unspecified = summary.byState.find((row) => row.name === "Not Specified");
  const unattributed = (panIndia?.value ?? 0) + (unspecified?.value ?? 0);
  if (unattributed > 0 && kpis.totalSpend > 0) {
    const share = unattributed / kpis.totalSpend;
    insights.push({
      id: "gap-geography",
      kind: "gap",
      severity: share > 0.25 ? "warning" : "neutral",
      title: `${SHARE(share)} of spend cannot be placed on the map`,
      detail:
        `${CRORE(panIndia?.value ?? 0)} is filed as "Pan India" and ${CRORE(unspecified?.value ?? 0)} has no state recorded. ` +
        `State-level rankings and the choropleth cover only the remaining ${CRORE(kpis.totalSpend - unattributed)}.`,
      evidence: [
        { label: "Pan India", value: CRORE(panIndia?.value ?? 0) },
        { label: "Not specified", value: CRORE(unspecified?.value ?? 0) },
        { label: "Share of total", value: SHARE(share) },
      ],
    });
  }

  // ---- 6. Thematic mix ---------------------------------------------------
  if (summary.byTheme.length >= 2) {
    const [first, second] = summary.byTheme;
    const combined = ((first.share ?? 0) + (second.share ?? 0)) * 100;
    insights.push({
      id: "concentration-themes",
      kind: "concentration",
      severity: "neutral",
      title: `${first.name} and ${second.name} take ${combined.toFixed(0)}% of spend`,
      detail:
        `${first.name} received ${CRORE(first.value)} across ${first.count?.toLocaleString("en-IN")} projects and ` +
        `${second.name} ${CRORE(second.value)}. The remaining ${summary.byTheme.length - 2} Schedule VII categories ` +
        `share ${SHARE(1 - (first.share ?? 0) - (second.share ?? 0))}.`,
      evidence: [
        { label: first.name, value: CRORE(first.value) },
        { label: second.name, value: CRORE(second.value) },
        { label: "Categories", value: String(summary.byTheme.length) },
      ],
      action: { label: `Filter to ${first.name}`, filters: { themes: [first.name] } },
    });
  }

  // ---- 7. Fastest movers -------------------------------------------------
  const movers = summary.bySector
    .filter((row) => (row.previous ?? 0) >= 20 && row.yoyGrowthPct !== null)
    .sort((a, b) => (b.yoyGrowthPct ?? 0) - (a.yoyGrowthPct ?? 0));
  if (movers.length >= 2) {
    const up = movers[0];
    const down = movers[movers.length - 1];
    insights.push({
      id: "trend-sectors",
      kind: "trend",
      severity: "neutral",
      title: `${up.name} grew ${PCT(up.yoyGrowthPct ?? 0)} while ${down.name} fell ${PCT(down.yoyGrowthPct ?? 0)}`,
      detail:
        `Among sectors with at least ₹20 Cr in the prior year, ${up.name} moved from ${CRORE(up.previous ?? 0)} to ` +
        `${CRORE(up.latest ?? 0)}, and ${down.name} from ${CRORE(down.previous ?? 0)} to ${CRORE(down.latest ?? 0)}.`,
      evidence: [
        { label: "Fastest riser", value: `${up.name} ${PCT(up.yoyGrowthPct ?? 0)}` },
        { label: "Sharpest faller", value: `${down.name} ${PCT(down.yoyGrowthPct ?? 0)}` },
      ],
      action: { label: `Filter to ${up.name}`, filters: { sectors: [up.name] } },
    });
  }

  // ---- 8. Aspirational districts ----------------------------------------
  if (kpis.aspirationalSpend > 0) {
    insights.push({
      id: "aspirational",
      kind: "gap",
      severity: kpis.aspirationalShare < 0.05 ? "warning" : "positive",
      title: `${SHARE(kpis.aspirationalShare)} of spend reaches aspirational districts`,
      detail:
        `${CRORE(kpis.aspirationalSpend)} is recorded in districts on the government's aspirational list. ` +
        `The dashboard flags these from the workbook's own aspirational-districts sheet.`,
      evidence: [
        { label: "Aspirational spend", value: CRORE(kpis.aspirationalSpend) },
        { label: "Share", value: SHARE(kpis.aspirationalShare) },
      ],
      action: { label: "Show aspirational only", filters: { aspirationalOnly: true } },
    });
  }

  // ---- 9. Forecast -------------------------------------------------------
  if (forecast.nextYear && forecast.nextYearSpend !== null) {
    const change =
      kpis.latestYearSpend > 0 ? ((forecast.nextYearSpend - kpis.latestYearSpend) / kpis.latestYearSpend) * 100 : 0;
    insights.push({
      id: "forecast",
      kind: "forecast",
      severity: "neutral",
      title: `${forecast.nextYear} projected at ${CRORE(forecast.nextYearSpend)}`,
      detail: `${forecast.method}. ${forecast.caveat}`,
      evidence: [
        { label: "Projection", value: CRORE(forecast.nextYearSpend) },
        { label: "vs. latest actual", value: PCT(change) },
        { label: "Fit (R²)", value: forecast.r2 === null ? "—" : forecast.r2.toFixed(3) },
      ],
    });
  }

  // ---- Anomalies ---------------------------------------------------------
  const anomalies = [
    ...findAnomalies(rows, "company"),
    ...findAnomalies(rows, "state"),
  ]
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, 10);

  if (anomalies.length) {
    const top = anomalies[0];
    insights.push({
      id: "anomaly-top",
      kind: "anomaly",
      severity: top.direction === "drop" ? "critical" : "warning",
      title: `${top.name} ${top.direction === "spike" ? "jumped" : "dropped"} ${PCT(top.deviationPct)} in ${top.year}`,
      detail:
        `Moved from ${CRORE(top.expected)} to ${CRORE(top.value)} — ${Math.abs(top.zScore).toFixed(1)} standard deviations ` +
        `from the typical year-on-year change in this view. Worth checking against the source filing.`,
      evidence: [
        { label: "Previous", value: CRORE(top.expected) },
        { label: top.year, value: CRORE(top.value) },
        { label: "z-score", value: top.zScore.toFixed(2) },
      ],
    });
  }

  // ---- Data quality ------------------------------------------------------
  const stats = data.stats ?? {};
  let noSpend = 0;
  let unclassifiedSector = 0;
  for (const row of rows) {
    if (Number.isNaN(data.spent[row])) noSpend += 1;
    if ((data.sectors[data.sectorIdx[row]] ?? "Unclassified") === "Unclassified") {
      unclassifiedSector += 1;
    }
  }
  const dataQuality: InsightsResponse["dataQuality"] = [
    {
      label: "Rows in view",
      value: rows.length.toLocaleString("en-IN"),
      severity: "neutral",
    },
    {
      label: "Projects with no disclosed amount",
      value: `${noSpend.toLocaleString("en-IN")} (${((noSpend / Math.max(1, rows.length)) * 100).toFixed(1)}% of view)`,
      severity: noSpend > rows.length * 0.05 ? "warning" : "neutral",
    },
    {
      label: "Duplicate rows removed at ingest (dataset)",
      value: Number(stats.duplicates_removed ?? 0).toLocaleString("en-IN"),
      severity: "neutral",
    },
    {
      label: "Sector backfilled at ingest (dataset)",
      value: Number(stats.sector_backfilled ?? 0).toLocaleString("en-IN"),
      severity: "neutral",
    },
    {
      label: "Unclassified sector rows",
      value: unclassifiedSector.toLocaleString("en-IN"),
      severity: unclassifiedSector > 0 ? "warning" : "positive",
    },
    {
      label: "Project outlay column",
      value: "Repeats company totals in part of FY 2020-21 — not summable",
      severity: "warning",
    },
  ];

  // ---- Recommendations ---------------------------------------------------
  const recommendations: InsightsResponse["recommendations"] = [];
  if (unattributed / Math.max(1, kpis.totalSpend) > 0.15) {
    recommendations.push({
      title: "Push filers to attribute spend to a state",
      detail: `${SHARE(unattributed / kpis.totalSpend)} of spend is filed as Pan India or left blank, which blocks any regional analysis.`,
      impact: `${CRORE(unattributed)} currently unmappable`,
    });
  }
  if (kpis.top10Share > 0.3) {
    recommendations.push({
      title: "Report medians alongside totals",
      detail: `With the top 10 filers at ${SHARE(kpis.top10Share)} of spend, the mean (${CRORE(kpis.avgSpendPerCompany)}) overstates the typical company. The median is ${CRORE(kpis.medianSpendPerCompany)}.`,
      impact: `${(kpis.avgSpendPerCompany / Math.max(0.01, kpis.medianSpendPerCompany)).toFixed(1)}× gap between mean and median`,
    });
  }
  if (kpis.aspirationalShare < 0.08 && kpis.aspirationalSpend > 0) {
    recommendations.push({
      title: "Aspirational-district coverage is thin",
      detail: `Only ${SHARE(kpis.aspirationalShare)} of spend lands in aspirational districts despite policy emphasis on them.`,
      impact: `${CRORE(kpis.aspirationalSpend)} of ${CRORE(kpis.totalSpend)}`,
    });
  }
  if (summary.byTheme.length && (summary.byTheme[0].share ?? 0) > 0.2) {
    recommendations.push({
      title: `Check whether ${summary.byTheme[0].name} crowds out other categories`,
      detail: `${summary.byTheme[0].name} absorbs ${SHARE(summary.byTheme[0].share ?? 0)} of spend; the bottom half of Schedule VII categories share ${SHARE(summary.byTheme.slice(Math.ceil(summary.byTheme.length / 2)).reduce((sum, row) => sum + (row.share ?? 0), 0))}.`,
      impact: `${summary.byTheme.length} categories in view`,
    });
  }
  if (unclassifiedSector > 0) {
    recommendations.push({
      title: "Classify the remaining Unclassified companies",
      detail: `${unclassifiedSector.toLocaleString("en-IN")} rows in the current view have no BRSR sector even after backfilling from the per-sector sheets.`,
      impact: "Improves sector benchmarking accuracy",
    });
  }

  const summaryLines = [
    `${scopeLabel}: ${CRORE(kpis.totalSpend)} of CSR spend across ${kpis.projectCount.toLocaleString("en-IN")} projects and ${kpis.companyCount.toLocaleString("en-IN")} companies.`,
    kpis.yoyGrowthPct !== null
      ? `Spend ${kpis.yoyGrowthPct >= 0 ? "grew" : "contracted"} ${PCT(kpis.yoyGrowthPct)} in ${kpis.latestYear}, with ${CRORE(kpis.latestYearSpend)} reported.`
      : `Only one financial year is in view, so no growth rate is available.`,
    `Spend is concentrated: the top 10 companies hold ${SHARE(kpis.top10Share)}, and ${summary.byTheme[0]?.name ?? "the leading category"} takes ${SHARE(summary.byTheme[0]?.share ?? 0)} of the thematic mix.`,
    forecast.nextYear && forecast.nextYearSpend !== null
      ? `A linear projection puts ${forecast.nextYear} at ${CRORE(forecast.nextYearSpend)} (R² ${forecast.r2?.toFixed(2) ?? "—"}); treat it as directional.`
      : `Not enough history for a projection.`,
  ];

  return {
    generatedAt: data.generatedAt,
    scope: scopeLabel,
    summary: summaryLines,
    insights,
    forecast,
    anomalies,
    recommendations,
    dataQuality,
  };
}

/** Compact, factual context handed to the LLM for narration / chat. */
export function buildFactPack(filters: Filters, scopeLabel: string) {
  const summary = buildSummary(filters, 10);
  const base = buildInsights(filters, scopeLabel);
  return {
    scope: scopeLabel,
    currency: "INR Crore",
    kpis: summary.kpis,
    trend: summary.trend,
    forecast: base.forecast,
    topCompanies: summary.topCompanies.map((row) => ({ name: row.name, spend: row.value, share: row.share })),
    topStates: summary.byState.slice(0, 10).map((row) => ({ name: row.name, spend: row.value, share: row.share })),
    topSectors: summary.bySector.slice(0, 10).map((row) => ({ name: row.name, spend: row.value, share: row.share })),
    topThemes: summary.byTheme.slice(0, 10).map((row) => ({ name: row.name, spend: row.value, share: row.share })),
    implementationModes: summary.byMode.map((row) => ({ name: row.name, spend: row.value, share: row.share })),
    anomalies: base.anomalies.slice(0, 5),
    dataCaveats: base.dataQuality.filter((row) => row.severity === "warning").map((row) => `${row.label}: ${row.value}`),
  };
}
