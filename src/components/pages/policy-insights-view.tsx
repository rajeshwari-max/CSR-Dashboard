"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { SectionLabel } from "@/components/shared/page-frame";
import type { Filters } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import type { PolicyInsights } from "@/lib/policy";
import { useFilterStore } from "@/store/filters";
import { Download } from "lucide-react";
import { MetricInfo } from "@/components/shared/metric-info";
import { canScopeAnnexureFinancials } from "@/lib/annexure-scope";

const shortYear = (year: string) => year.replace(/^FY\s*/, "FY");
const companiesLine = (list: { name: string; value: number }[]) =>
  list.length ? list.map((c) => `${c.name} (${formatCrore(c.value)})`).join(" · ") : "—";
const FIN_LABELS: Record<string, string> = { obligation: "Required (obligation)", totalSpent: "Spent", unspent: "Unspent" };

/** Every company with unspent CSR in view, as a CSV: total plus one column per year. */
function downloadUnspent(list: { name: string; value: number; byYear: Record<string, number> }[], years: string[]) {
  const cols = years.filter((year) => list.some((row) => row.byYear[year]));
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["#", "Company", "Total unspent CSR (₹ crore)", ...cols.map((y) => `${y} (₹ crore)`)].map(esc).join(","),
    ...list.map((row, i) => [String(i + 1), esc(row.name), String(row.value), ...cols.map((y) => String(row.byYear[y] ?? ""))].join(",")),
  ];
  const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "unspent-csr-companies.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Small ranked list with proportional bars (used instead of plain text lists). */
function RankBars({ rows, limit = 5 }: { rows: { name: string; value: number }[]; limit?: number }) {
  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.value));
  if (!top.length) return <p className="text-[12px] text-muted-foreground">—</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {top.map((row, index) => (
        <li key={row.name} className="text-[12px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate">{index + 1}. {row.name}</span>
            <span className="numeric shrink-0 font-semibold">{formatCrore(row.value)}</span>
          </div>
          <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (row.value / max) * 100)}%`, background: index % 2 ? "var(--c2)" : "var(--c1)" }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const AXIS_LABEL = { fontSize: 11, fill: "var(--text-soft)" } as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const descriptions: Record<string, string> = {
    "CSR Spent in Aspirational Districts": "CSR money spent on projects in NITI Aayog's aspirational districts in the selected years.",
    "Companies Funding Them": "Companies with at least one CSR project in an aspirational district.",
    "Aspirational Districts Reached": "How many of the 112 official aspirational districts received at least one CSR project.",
    "Largest Contributor": "The company that spent the most on CSR projects in aspirational districts.",
    "Prescribed CSR Obligation": "The amount companies were required to spend on CSR (2% of average net profit), as stated in their annual CSR reports.",
    "Unspent CSR": "CSR money companies were required to spend but did not spend in the year, as stated in their annual CSR reports.",
    "Impact Assessment": "Money companies spent on studies that measure the impact of their CSR projects. This is separate from project spending.",
    "Implementing Agencies": "Organisations (such as NGOs and trusts) that carried out CSR projects for companies, as named in company CSR reports.",
    "Amount Routed through Them": "CSR money companies spent through these organisations.",
    "Companies Naming Partners": "Companies that name at least one implementing organisation in their CSR report.",
    "Largest Partner": "The implementing organisation that received the most CSR money.",
    "Most-used Partner": "The implementing organisation that works with the most companies.",
    "State with Most Partners": "The state with the most implementing organisations named in company CSR reports.",
  };
  return (
    <div className="kpi-card">
      <div className="kpi-label metric-title"><span>{label}</span><MetricInfo title={label} meta={{ description: descriptions[label] ?? sub ?? label }} /></div>
      <div className="kpi-value" title={value}>{value}</div>
      {sub ? <div className="kpi-sub"><span className="truncate1">{sub}</span></div> : null}
    </div>
  );
}

/** Top-level heading for the three CSR Insights sections. */
export function MainSection({ id, title, children }: { id?: string; title: string; children?: React.ReactNode }) {
  return (
    <div id={id} style={{ scrollMarginTop: 190, margin: "34px 0 4px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 650, color: "var(--text)" }}>{title}</h2>
      {children ? <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{children}</p> : null}
    </div>
  );
}

const OWNERSHIP_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)"];

/**
 * Policy content shown inside CSR Insights, after Company Analysis:
 * Section 2 (CSR Spending Analysis) and Section 3 (Unspent CSR Analysis).
 * Aspirational districts have their own tab (AspirationalSection).
 */
export function PolicyInsightsSections({ filters, filterQuery }: { filters: Filters; filterQuery: string }) {
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const policy = useApi<PolicyInsights>(`/api/policy?${filterQuery}`);
  // Links like /company-analysis#unspent-csr arrive before the data renders; scroll once it has.
  const hasData = Boolean(policy.data);
  React.useEffect(() => {
    if (!hasData || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [hasData]);
  const p = policy.data;
  const annexureScopeSupported = canScopeAnnexureFinancials(filters);

  return (
    <>
      <MainSection id="csr-spending" title="CSR Spending Analysis">
        How the CSR spending in this dashboard compares with all of India, how it splits between public and private companies and across focus areas, and which organisations carry out the projects.
      </MainSection>
      <SectionLabel>Share of all-India CSR covered</SectionLabel>
      <ChartCard
        title="CSR Spent by Dashboard Companies Compared with All of India"
        description={p?.filtered ? "Filters are applied, so the purple bars show only part of the data." : "CSR spent each year (₹ crore) by all companies in India and by the companies in this dashboard. The % under each year is the dashboard's share of all-India CSR. Source: MCA figures quoted in NITI Aayog's CSR concept note (Table 1)."}
        height={330}
        isLoading={policy.isLoading}
        error={policy.error}
        isEmpty={!p?.coverage.length}
        emptyMessage="All-India totals are available for FY 2020-21 to FY 2024-25."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={(p?.coverage ?? []).map((c) => ({ ...c, label: `${shortYear(c.year)} · ${formatShare(c.share)} of all-India` }))} margin={{ top: 8, right: 8, bottom: 22, left: 18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} label={{ value: "Financial year · dashboard share of all-India CSR", position: "insideBottom", offset: -14, style: AXIS_LABEL }} />
            <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} label={{ value: "CSR spent (₹ crore)", angle: -90, position: "insideLeft", offset: -8, style: AXIS_LABEL }} />
            <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, name: string) => [formatCrore(value), name === "national" ? "All-India (MCA)" : "Dashboard companies"]} />
            <Legend verticalAlign="top" height={28} formatter={(name: string) => (name === "national" ? "All-India (MCA)" : "Dashboard companies")} />
            <Bar dataKey="national" fill="var(--c2)" radius={[6, 6, 0, 0]} maxBarSize={44} />
            <Bar dataKey="dashboard" fill="var(--c1)" radius={[6, 6, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionLabel>Public and private companies</SectionLabel>
      <ChartCard
        title="CSR Expenditure by Company Ownership"
        description="How much CSR money came from private companies, PSUs, public sector banks and insurers. Click a slice or a row to filter the dashboard."
        height={Math.max(320, (p?.ownership.length ?? 3) * 64 + 20)}
        isLoading={policy.isLoading}
        error={policy.error}
        isEmpty={!p?.ownership.length}
      >
        <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,2fr)_3fr]">
          <div className="h-[280px] lg:h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={p?.ownership ?? []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="48%"
                  outerRadius="88%"
                  paddingAngle={1}
                  stroke="var(--surface)"
                  onClick={(slice: { name?: string }) => slice?.name && toggleValue("ownership", slice.name)}
                  className="cursor-pointer"
                >
                  {(p?.ownership ?? []).map((row, i) => (
                    <Cell key={row.name} fill={OWNERSHIP_COLORS[i % OWNERSHIP_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...TOOLTIP_STYLES}
                  formatter={(value: number, _name: string, item: { payload?: { share?: number } }) => [`${formatCrore(value)} · ${formatShare(item?.payload?.share ?? 0)} of total CSR spent`, "CSR spent"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {(p?.ownership ?? []).map((row, i) => (
              <button key={row.name} type="button" onClick={() => toggleValue("ownership", row.name)} className="rounded-lg px-2 py-1.5 text-left hover:bg-accent/60">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: OWNERSHIP_COLORS[i % OWNERSHIP_COLORS.length] }} />
                    {row.name}
                  </span>
                  <span className="numeric text-[13px] font-semibold">{formatCrore(row.value)} · {formatShare(row.share)} of total CSR spent</span>
                </div>
                <p className="mt-0.5 pl-[18px] text-[11px] text-muted-foreground">
                  {formatNumber(row.companies ?? 0)} companies · {formatNumber(row.count ?? 0)} projects · Largest: {companiesLine(row.topCompanies)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </ChartCard>

      <SectionLabel>Focus areas found in project descriptions</SectionLabel>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {(p?.focus ?? []).map((tag) => (
          <Card key={tag.id}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{tag.label}</CardTitle>
                <CardDescription>{formatNumber(tag.projects)} projects reported · {formatNumber(tag.companies)} companies</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="numeric text-2xl font-bold">{formatCrore(tag.spend)}</p>
              <p className="text-muted-foreground">{formatShare(tag.share)} of total CSR spent (selected filters)</p>
              <div style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tag.byYear.map((y) => ({ ...y, label: shortYear(y.year).replace(/^FY20/, "FY") }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="label" {...AXIS_PROPS} tick={{ fontSize: 10 }} />
                    <YAxis {...AXIS_PROPS} width={52} tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} label={{ value: "₹ crore", angle: -90, position: "insideLeft", offset: 6, style: { ...AXIS_LABEL, fontSize: 10, textAnchor: "middle" } }} />
                    <Tooltip {...TOOLTIP_STYLES} formatter={(value: number) => [formatCrore(value), "CSR spent"]} />
                    <Bar dataKey="spend" fill="var(--c1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted-foreground">CSR spent by financial year (₹ crore)</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top contributing companies</p>
              <RankBars rows={tag.topCompanies} limit={3} />
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionLabel>Implementing partners (NGOs and other organisations)</SectionLabel>
      {p?.partners ? (
        <>
          <div className={`grid grid-cols-2 gap-4 ${p.partners.byState.length ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <Stat label="Implementing Agencies" value={formatNumber(p.partners.implementers)} sub={p.partners.evaluatorCount > 0 ? `${formatNumber(p.partners.evaluatorCount)} monitoring and impact assessment agencies · ${formatNumber(p.partners.registered)} registered with MCA (CSR-1)` : `${formatNumber(p.partners.registered)} registered with MCA (CSR-1)`} />
            {p.partners.amount > 0 ? (
              <Stat label="Amount Routed through Them" value={formatCrore(p.partners.amount)} sub={`From ${formatNumber(p.partners.records)} reported projects`} />
            ) : (
              <Stat label="Companies Naming Partners" value={formatNumber(p.partners.companies)} sub={`From ${formatNumber(p.partners.records)} entries in company CSR reports`} />
            )}
            <Stat
              label={p.partners.amount > 0 ? "Largest Partner" : "Most-used Partner"}
              value={p.partners.top[0]?.name ?? "—"}
              sub={p.partners.top[0] ? (p.partners.amount > 0 ? formatCrore(p.partners.top[0].value) : `Works with ${p.partners.top[0].companies} companies`) : undefined}
            />
            {p.partners.byState.length ? (
              <Stat label="State with Most Partners" value={p.partners.byState[0].name} sub={`${p.partners.byState[0].agencies} implementing agencies`} />
            ) : null}
          </div>
          <div className={`grid grid-cols-1 gap-5 ${p.partners.evaluators.length ? "xl:grid-cols-2" : ""}`}>
            <ChartCard title="Largest Implementing Partners" description={p.partners.amount > 0 ? "Organisations that received the most CSR money to carry out projects, with the number of companies and states" : "Organisations named by the most companies in their CSR reports"} height={360} isEmpty={!p.partners.top.length}>
              <PartnerList rows={p.partners.top} />
            </ChartCard>
            {p.partners.evaluators.length ? (
            <ChartCard
                title="Monitoring and Impact Assessment Agencies"
                description="Organisations hired to monitor CSR projects or measure their impact"
                height={360}
                isEmpty={!p.partners.evaluators.length}
                emptyMessage="Company CSR reports do not name monitoring or impact assessment agencies yet."
              >
                <PartnerList rows={p.partners.evaluators} />
              </ChartCard>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No partner data loaded yet.</p>
      )}

      <MainSection id="unspent-csr-section" title="Unspent CSR Analysis">
        How much companies were required to spend on CSR, how much they spent, and how much was left unspent, as stated in their annual CSR reports.
      </MainSection>
      <div id="unspent-csr" style={{ scrollMarginTop: 190 }}><SectionLabel>Unspent CSR and impact assessment</SectionLabel></div>
      {!annexureScopeSupported ? (
        <p className="mb-5 rounded-lg border px-4 py-3 text-[12.5px] text-muted-foreground">Unspent CSR is reported for each company as a whole, so it cannot be split by location, Schedule VII area, implementing agency, search text, aspirational district or project amount. Clear those filters to see correct totals.</p>
      ) : p?.financials ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="Prescribed CSR Obligation" value={formatCrore(p.financials.obligation)} sub={`Reported by ${formatNumber(p.financials.companies)} companies`} />
            <Stat label="Unspent CSR" value={formatCrore(p.financials.unspent)} sub={`${formatNumber(p.financials.unspentCompanies)} companies with unspent CSR`} />
            <Stat label="Impact Assessment" value={formatCrore(p.financials.impact)} sub={`Required in ${formatNumber(p.financials.impactApplicable)} company reports · ${formatNumber(p.financials.impactReports)} impact reports linked`} />
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <ChartCard title="Required, Spent and Unspent CSR by Year" description="Each year: how much companies had to spend on CSR, how much they spent, and how much was unspent (₹ crore), from company CSR reports" height={320} className="xl:col-span-2" isEmpty={!p.financials.byYear.some((y) => y.obligation || y.totalSpent)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={p.financials.byYear.map((y) => ({ ...y, label: shortYear(y.year) }))} margin={{ top: 8, right: 8, bottom: 22, left: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" {...AXIS_PROPS} label={{ value: "Financial year", position: "insideBottom", offset: -14, style: AXIS_LABEL }} />
                  <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} label={{ value: "Amount (₹ crore)", angle: -90, position: "insideLeft", offset: -8, style: AXIS_LABEL }} />
                  <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, name: string) => [formatCrore(value), FIN_LABELS[name] ?? name]} />
                  <Legend verticalAlign="top" height={28} formatter={(name: string) => FIN_LABELS[name] ?? name} />
                  <Bar dataKey="obligation" fill="var(--c2)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="totalSpent" fill="var(--c1)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="unspent" fill="var(--c3)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Companies with the Largest Unspent CSR"
              description={`${formatNumber(p.financials.unspentCompanies)} companies have unspent CSR in your selection. The top 10 are shown (₹ crore, total for the selected years).`}
              height={320}
              isEmpty={!p.financials.topUnspent.length}
              emptyMessage="No unspent CSR reported for this selection."
              action={
                p.financials.unspentList.length ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadUnspent(p.financials!.unspentList, p.years)}>
                    <Download width={13} height={13} /> Full list
                  </button>
                ) : null
              }
            >
              <div className="h-full overflow-y-auto"><RankBars rows={p.financials.topUnspent} limit={10} /></div>
            </ChartCard>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No company CSR report data loaded yet.</p>
      )}

    </>
  );
}

/** Aspirational districts analysis, shown on its own tab. */
export function AspirationalSection({ filterQuery, singleDistrict = false }: { filterQuery: string; singleDistrict?: boolean }) {
  const policy = useApi<PolicyInsights>(`/api/policy?${filterQuery}`);
  const p = policy.data;
  return (
    <>
      <SectionLabel>Aspirational districts</SectionLabel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="CSR Spent in Aspirational Districts" value={formatCrore(p?.aspirational.total ?? 0)} sub={`${formatShare(p?.aspirational.share ?? 0)} of total CSR spent (selected filters)`} />
        <Stat label="Companies Funding Them" value={formatNumber(p?.aspirational.companies ?? 0)} sub="With projects in aspirational districts" />
        <Stat label="Aspirational Districts Reached" value={`${formatNumber(p?.aspirational.districtsReached ?? 0)} of ${p?.aspirational.officialCount ?? 112}`} sub="Received at least one CSR project" />
        <Stat label="Largest Contributor" value={p?.aspirational.topCompanies[0]?.name ?? "—"} sub={p?.aspirational.topCompanies[0] ? formatCrore(p.aspirational.topCompanies[0].value) : undefined} />
      </div>
      {singleDistrict ? null : (
      <ChartCard
        title="Share of CSR Spent Reaching Aspirational Districts"
        description="Share of each year's CSR spent that went to NITI Aayog's 112 aspirational districts"
        height={300}
        isLoading={policy.isLoading}
        error={policy.error}
        isEmpty={!p?.aspirational.byYear.length}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={(p?.aspirational.byYear ?? []).map((y) => ({ ...y, pct: Math.round(y.share * 1000) / 10, label: shortYear(y.year) }))} margin={{ top: 8, right: 8, bottom: 22, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} label={{ value: "Financial year", position: "insideBottom", offset: -14, style: AXIS_LABEL }} />
            <YAxis {...AXIS_PROPS} unit="%" domain={[0, 16]} label={{ value: "% of CSR spent", angle: -90, position: "insideLeft", offset: 0, style: AXIS_LABEL }} />
            <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, _name: string, item: { payload?: { spend?: number } }) => [`${value}% (${formatCrore(item.payload?.spend ?? 0)})`, "Share of spent"]} />
            <Bar dataKey="pct" fill="var(--c2)" radius={[6, 6, 0, 0]} maxBarSize={52} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      )}
      <ChartCard title="Top Contributors to Aspirational Districts" description="Companies that spent the most CSR money in aspirational districts (₹ crore)" height={200} isLoading={policy.isLoading} error={policy.error} isEmpty={!p?.aspirational.topCompanies.length}>
        <RankBars rows={p?.aspirational.topCompanies ?? []} />
      </ChartCard>

    </>
  );
}

function PartnerList({ rows }: { rows: { name: string; value: number; companies: number; states: number; registration: string | null }[] }) {
  const max = Math.max(1, ...rows.map((r) => (r.value > 0 ? r.value : r.companies)));
  return (
    <ol className="h-full space-y-1.5 overflow-y-auto text-[13px]">
      {rows.map((row, index) => (
        <li key={row.name}>
        <div className="flex justify-between gap-3">
          <span className="truncate">{index + 1}. {row.name}{row.registration ? ` (${row.registration})` : ""}</span>
          <span className="numeric shrink-0">{[row.value > 0 ? formatCrore(row.value) : null, `${row.companies} ${row.companies === 1 ? "company" : "companies"}`, row.states > 0 ? `${row.states} states` : null].filter(Boolean).join(" · ")}</span>
        </div>
        <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full" style={{ width: `${Math.max(3, ((row.value > 0 ? row.value : row.companies) / max) * 100)}%`, background: index % 2 ? "var(--c2)" : "var(--c1)" }} />
        </span>
        </li>
      ))}
    </ol>
  );
}
