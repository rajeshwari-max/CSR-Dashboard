"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Upload } from "lucide-react";

import { ChartCard } from "@/components/charts/chart-card";
import { AXIS_PROPS, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatCrore, formatNumber, formatShare } from "@/lib/format";
import type { PolicyInsights } from "@/lib/policy";
import { useFilterStore } from "@/store/filters";

const shortYear = (year: string) => year.replace(/^FY\s*/, "FY");
const companiesLine = (list: { name: string; value: number }[]) =>
  list.length ? list.map((c) => `${c.name} (${formatCrore(c.value)})`).join(" · ") : "—";
const FIN_LABELS: Record<string, string> = { obligation: "Obligation", totalSpent: "Spent", unspent: "Unspent" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" title={value}>{value}</div>
      {sub ? <div className="kpi-sub"><span className="truncate1">{sub}</span></div> : null}
    </div>
  );
}

function UploadPanel({ kind, title, what, onDone }: { kind: "financials" | "partners"; title: string; what: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = React.useState<"merge" | "replace">("merge");
  const inputId = `upload-${kind}`;
  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("mode", mode);
      const response = await fetch(`/api/extra-data/${kind}`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.error ?? "Upload failed"}${result.detail ? `: ${result.detail}` : ""}`);
      setMessage({ ok: true, text: `Imported ${formatNumber(result.imported)} rows${result.skipped ? ` (${result.skipped} skipped: missing company, year or agency)` : ""}. ${formatNumber(result.total)} rows stored.` });
      onDone();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{what}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <a className="btn btn-outline" href={`/api/extra-data/${kind}`}>
            <Download width={14} height={14} /> Download Excel template
          </a>
          <label htmlFor={inputId} className="btn btn-primary" style={{ cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
            <Upload width={14} height={14} /> {busy ? "Uploading…" : "Upload filled template"}
          </label>
          <input id={inputId} type="file" accept=".xlsx,.xlsm,.csv" className="sr-only" disabled={busy}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
          <label className="flex items-center gap-2 text-muted-foreground" htmlFor={`${inputId}-mode`}>
            If rows already exist
            <select id={`${inputId}-mode`} value={mode} onChange={(event) => setMode(event.target.value as "merge" | "replace")} className="rounded-md border bg-transparent px-2 py-1">
              <option value="merge">add and update</option>
              <option value="replace">replace all</option>
            </select>
          </label>
        </div>
        {message ? <p className={message.ok ? "text-emerald-600" : "text-red-600"} role="status">{message.text}</p> : null}
      </CardContent>
    </Card>
  );
}

export function PolicyInsightsView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const toggleValue = useFilterStore((state) => state.toggleValue);
  const meta = useMeta();
  const policy = useApi<PolicyInsights>(`/api/policy?${filterQuery}`);
  const p = policy.data;
  const ownershipMax = Math.max(1, ...(p?.ownership ?? []).map((row) => row.value));

  return (
    <PageFrame
      title="Policy Insights"
      subtitle={`Coverage, ownership, aspirational districts, focus areas, unspent CSR and partners · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      error={policy.error ?? meta.error}
      onRefresh={() => policy.refetch()}
      isRefreshing={policy.isValidating}
    >
      {p ? (
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardContent className="flex flex-col gap-1 py-4 text-sm">
            <p className="font-medium">Data clean-up applied across the dashboard</p>
            <p className="text-muted-foreground">
              {formatNumber(p.cleanup.companiesMerged)} company name variants merged (e.g. “TCS” and “Tata Consultancy Services”) ·{" "}
              {formatNumber(p.cleanup.duplicateRows)} duplicate project lines removed ({formatCrore(p.cleanup.duplicateSpend)} that was counted twice) ·{" "}
              {formatNumber(p.cleanup.cinsCleared)} CINs shared by unrelated companies cleared · aspirational flags checked against NITI Aayog’s official list of 112 districts, by state and district.
            </p>
            {p.cleanup.mergedNames.length ? (
              <details className="text-muted-foreground">
                <summary className="cursor-pointer">Show merged names</summary>
                <ul className="mt-2 list-disc pl-5">{p.cleanup.mergedNames.map((group) => <li key={group.join("|")}>{group.join(" = ")}</li>)}</ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <SectionLabel>Coverage of all-India CSR</SectionLabel>
      <ChartCard
        title="Dashboard Companies against All-India CSR Spent"
        description={p?.filtered ? "Filters are applied, so the dashboard bars show only part of the data" : "All-India totals: MCA data quoted in NITI Aayog’s CSR consultation concept note (Table 1); label shows the dashboard’s share"}
        height={300}
        isLoading={policy.isLoading}
        error={policy.error}
        isEmpty={!p?.coverage.length}
        emptyMessage="All-India totals are available for FY 2020-21 to FY 2024-25."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={(p?.coverage ?? []).map((c) => ({ ...c, label: `${shortYear(c.year)} · ${formatShare(c.share)}` }))} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
            <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, name: string) => [formatCrore(value), name === "national" ? "All-India (MCA)" : "Dashboard companies"]} />
            <Legend formatter={(name: string) => (name === "national" ? "All-India (MCA)" : "Dashboard companies")} />
            <Bar dataKey="national" fill="var(--c6)" radius={[6, 6, 0, 0]} maxBarSize={44} />
            <Bar dataKey="dashboard" fill="var(--c1)" radius={[6, 6, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionLabel>Public sector and private companies</SectionLabel>
      <ChartCard
        title="CSR Spent by Company Ownership"
        description="Click a row to filter the whole dashboard to that ownership class"
        height={Math.max(240, (p?.ownership.length ?? 3) * 70 + 30)}
        isLoading={policy.isLoading}
        error={policy.error}
        isEmpty={!p?.ownership.length}
      >
        <div className="flex h-full flex-col gap-2 overflow-y-auto">
          {(p?.ownership ?? []).map((row) => (
            <button key={row.name} type="button" onClick={() => toggleValue("ownership", row.name)} className="rounded-lg px-2 py-1.5 text-left hover:bg-accent/60">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold">{row.name}</span>
                <span className="numeric text-[13px] font-semibold">{formatCrore(row.value)} · {formatShare(row.share)}</span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary/80" style={{ width: `${Math.max(2, (row.value / ownershipMax) * 100)}%` }} />
              </span>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatNumber(row.companies ?? 0)} companies · {formatNumber(row.count ?? 0)} projects · Largest: {companiesLine(row.topCompanies)}
              </p>
            </button>
          ))}
          <p className="px-2 text-[11px] text-muted-foreground">Ownership from public shareholding (list kept in src/lib/reference/ownership.json). Public sector banks file few project lines in this register.</p>
        </div>
      </ChartCard>

      <SectionLabel>Aspirational districts</SectionLabel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="CSR Spent in Aspirational Districts" value={formatCrore(p?.aspirational.total ?? 0)} sub={`${formatShare(p?.aspirational.share ?? 0)} of spent in view`} />
        <Stat label="Population Share of These Districts" value={`Over ${formatShare(p?.aspirational.populationShare ?? 0)}`} sub="Of India’s population (NITI concept note)" />
        <Stat label="Aspirational Districts Reached" value={`${formatNumber(p?.aspirational.districtsReached ?? 0)} of ${p?.aspirational.officialCount ?? 112}`} sub="Named in project filings" />
        <Stat label="Largest Contributor" value={p?.aspirational.topCompanies[0]?.name ?? "—"} sub={p?.aspirational.topCompanies[0] ? formatCrore(p.aspirational.topCompanies[0].value) : undefined} />
      </div>
      <ChartCard
        title="Share of CSR Spent Reaching Aspirational Districts"
        description="Bars: share of each year’s spent · dashed line: these districts’ share of India’s population"
        height={280}
        isLoading={policy.isLoading}
        error={policy.error}
        isEmpty={!p?.aspirational.byYear.length}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={(p?.aspirational.byYear ?? []).map((y) => ({ ...y, pct: Math.round(y.share * 1000) / 10, label: shortYear(y.year) }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} unit="%" domain={[0, 16]} />
            <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, _name: string, item: { payload?: { spend?: number } }) => [`${value}% (${formatCrore(item.payload?.spend ?? 0)})`, "Share of spent"]} />
            <ReferenceLine y={Math.round((p?.aspirational.populationShare ?? 0.15) * 100)} stroke="var(--text-soft)" strokeDasharray="5 4" label={{ value: "Population share", position: "insideTopRight", fontSize: 11, fill: "var(--text-soft)" }} />
            <Bar dataKey="pct" fill="var(--c2)" radius={[6, 6, 0, 0]} maxBarSize={52} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <p className="text-[12px] text-muted-foreground">Top contributors: {companiesLine(p?.aspirational.topCompanies ?? [])}</p>

      <SectionLabel>Focus areas the Schedule VII head cannot show</SectionLabel>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {(p?.focus ?? []).map((tag) => (
          <Card key={tag.id}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{tag.label}</CardTitle>
                <CardDescription>{formatNumber(tag.projects)} projects · {formatNumber(tag.companies)} companies</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="numeric text-2xl font-bold">{formatCrore(tag.spend)}</p>
              <p className="text-muted-foreground">{formatShare(tag.share)} of spent in view</p>
              <p className="text-[12px] text-muted-foreground">By year: {tag.byYear.map((y) => `${shortYear(y.year)} ${formatCrore(y.spend)}`).join(" · ")}</p>
              <p className="text-[12px]">Largest: {companiesLine(tag.topCompanies)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">Found from words in project names (e.g. “relief”, “COVID”, “preparedness”, “divyang”, “disability”), so treat these as close estimates; one project can carry more than one tag.</p>

      <SectionLabel>Unspent CSR and impact assessment</SectionLabel>
      {p?.financials ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Prescribed CSR Obligation" value={formatCrore(p.financials.obligation)} sub={`${formatNumber(p.financials.companies)} companies uploaded`} />
            <Stat label="Unspent CSR" value={formatCrore(p.financials.unspent)} sub={`${formatCrore(p.financials.toUnspentAccount)} to Unspent CSR Accounts`} />
            <Stat label="Transferred to Schedule VII Funds" value={formatCrore(p.financials.toScheduleVIIFund)} sub="e.g. PM CARES, Swachh Bharat Kosh" />
            <Stat label="Impact Assessment" value={formatCrore(p.financials.impact)} sub={`${formatNumber(p.financials.impactApplicable)} filings applicable · ${formatNumber(p.financials.impactReports)} reports linked`} />
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <ChartCard title="CSR Obligation, Spent and Unspent by Year" description="From uploaded annual-report CSR annexures" height={300} className="xl:col-span-2" isEmpty={!p.financials.byYear.some((y) => y.obligation || y.totalSpent)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={p.financials.byYear.map((y) => ({ ...y, label: shortYear(y.year) }))} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
                  <Tooltip {...TOOLTIP_STYLES} formatter={(value: number, name: string) => [formatCrore(value), FIN_LABELS[name] ?? name]} />
                  <Legend formatter={(name: string) => FIN_LABELS[name] ?? name} />
                  <Bar dataKey="obligation" fill="var(--c6)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="totalSpent" fill="var(--c1)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="unspent" fill="var(--c4)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Companies with the Largest Unspent CSR" description="Total over the years in view" height={300} isEmpty={!p.financials.topUnspent.length} emptyMessage="No unspent amounts in the uploaded rows.">
              <ol className="h-full space-y-1 overflow-y-auto text-[13px]">
                {p.financials.topUnspent.map((row, index) => (
                  <li key={row.name} className="flex justify-between gap-3"><span className="truncate">{index + 1}. {row.name}</span><span className="numeric font-semibold">{formatCrore(row.value)}</span></li>
                ))}
              </ol>
            </ChartCard>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Not in the MCA project register. Fill the template from each company’s annual-report CSR annexure and upload it to switch these figures on.</p>
      )}
      <UploadPanel
        kind="financials"
        title="CSR financials upload"
        what="One row per company per year: obligation, amount spent, unspent CSR, transfers to the Unspent CSR Account and Schedule VII funds, impact assessment."
        onDone={() => policy.refetch()}
      />

      <SectionLabel>Implementing partners (NGOs)</SectionLabel>
      {p?.partners ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Implementing Agencies" value={formatNumber(p.partners.agencies)} sub={`${formatNumber(p.partners.registered)} with a CSR-1 registration number`} />
            <Stat label="Amount Routed through Them" value={formatCrore(p.partners.amount)} sub={`${formatNumber(p.partners.records)} project rows uploaded`} />
            <Stat label="Largest Partner" value={p.partners.top[0]?.name ?? "—"} sub={p.partners.top[0] ? formatCrore(p.partners.top[0].value) : undefined} />
            <Stat label="State with Most Partners" value={p.partners.byState[0]?.name ?? "—"} sub={p.partners.byState[0] ? `${p.partners.byState[0].agencies} agencies` : undefined} />
          </div>
          <ChartCard title="Largest Implementing Partners" description="Amount, number of funding companies and states covered" height={360} isEmpty={!p.partners.top.length}>
            <ol className="h-full space-y-1 overflow-y-auto text-[13px]">
              {p.partners.top.map((row, index) => (
                <li key={row.name} className="flex justify-between gap-3">
                  <span className="truncate">{index + 1}. {row.name}{row.registration ? ` (${row.registration})` : ""}</span>
                  <span className="numeric shrink-0">{formatCrore(row.value)} · {row.companies} cos · {row.states} states</span>
                </li>
              ))}
            </ol>
          </ChartCard>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">The MCA register records only whether an agency was used, not which one. Upload partner names from the annual-report CSR annexures to see who delivers CSR and where.</p>
      )}
      <UploadPanel
        kind="partners"
        title="Implementing partners upload"
        what="One row per company, year and project: implementing agency name, CSR registration number, state, district and amount."
        onDone={() => policy.refetch()}
      />
    </PageFrame>
  );
}
