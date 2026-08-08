"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Loader2,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";

import { MiniLabel, PageFrame } from "@/components/shell/page-frame";
import { useShell } from "@/components/shell/app-shell";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { clearApiCache } from "@/lib/api";
import { formatCrore, formatDateTime, formatNumber, truncate } from "@/lib/format";
import { useFilterStore } from "@/store/filters";

interface Check {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

interface UploadResponse {
  ok: boolean;
  dryRun?: boolean;
  checks: Check[];
  preview?: {
    company: string; year: string; sector: string; state: string;
    theme: string; project: string | null; spent: number | null;
  }[];
  summary?: {
    rows: number; addedRows: number; companies: number; years: string[];
    states: number; sectors: number; districts: number; totalSpend: number; sheets: string[];
  };
  mode?: string;
  backup?: string | null;
  error?: string;
  detail?: string;
}

type Mode = "replace" | "merge";

/**
 * Data Upload — validate, preview, then commit. Nothing is written until the
 * preview is confirmed, and the previous dataset is backed up so any upload can
 * be rolled back.
 */
export function UploadView() {
  const router = useRouter();
  const { toast } = useShell();
  const { filters } = useDashboardFilters();
  const meta = useMeta();
  const clearAll = useFilterStore((state) => state.clearAll);

  const [file, setFile] = React.useState<File | null>(null);
  const [mode, setMode] = React.useState<Mode>("replace");
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState<"validate" | "commit" | null>(null);
  const [result, setResult] = React.useState<UploadResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [backups, setBackups] = React.useState<{ name: string; savedAt: string; bytes: number }[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const loadBackups = React.useCallback(async () => {
    try {
      const response = await fetch("/api/dataset");
      const body = (await response.json()) as { backups?: typeof backups };
      setBackups(body.backups ?? []);
    } catch {
      /* listing is best-effort */
    }
  }, []);
  React.useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? "validate" : "commit");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      if (dryRun) form.append("dryRun", "1");

      const response = await fetch("/api/upload", { method: "POST", body: form });
      const body = (await response.json()) as UploadResponse;
      setResult(body);

      if (!response.ok || !body.ok) {
        setError(body.detail ?? body.error ?? "Validation failed — see the checks below.");
        return;
      }
      if (!dryRun) {
        // Server data changed: drop every cached response before re-rendering.
        clearApiCache();
        clearAll();
        meta.refetch();
        router.refresh();
        toast(
          `Dataset updated · ${formatNumber(body.summary?.rows ?? 0)} rows, ${formatNumber(body.summary?.companies ?? 0)} companies`,
        );
        void loadBackups();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (name: string) => {
    setBusy("commit");
    try {
      const response = await fetch("/api/dataset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restore: name }),
      });
      if (!response.ok) throw new Error("Restore failed");
      clearApiCache();
      meta.refetch();
      router.refresh();
      setResult(null);
      toast("Previous dataset restored");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  };

  const committed = result?.ok && result.dryRun === false;
  const validated = result?.ok && result.dryRun === true;

  return (
    <PageFrame
      title="Data Upload"
      subtitle="Replace or extend the dataset. Every chart, KPI, table, insight and trend re-reads from it automatically."
      meta={meta.data}
      filters={filters}
      showFilters={false}
      onRefresh={() => meta.refetch()}
      error={null}
    >
      <MiniLabel>Current dataset</MiniLabel>
      <div className="card" style={{ marginBottom: 32 }}>
        {meta.data ? (
          <div className="row" style={{ gap: 28, flexWrap: "wrap" }}>
            <Figure label="Rows" value={formatNumber(meta.data.rowCount)} />
            <Figure label="Companies" value={formatNumber(meta.data.companyCount)} />
            <Figure label="Total spend" value={formatCrore(meta.data.totalSpend)} />
            <Figure label="Years" value={meta.data.years.join(", ") || "—"} />
            <Figure label="States" value={String(meta.data.states.length)} />
            <Figure label="Built" value={formatDateTime(meta.data.generatedAt)} />
            <Figure
              label="Source"
              value={meta.data.sources.map((source) => source.file).join(", ") || "—"}
            />
          </div>
        ) : (
          <div className="empty-state">
            <h4>No dataset loaded</h4>
            <p>Upload a CSV or Excel file below to get started.</p>
          </div>
        )}
      </div>

      <MiniLabel>Upload a file</MiniLabel>
      <div className="grid cols-2" style={{ marginBottom: 32, alignItems: "start" }}>
        <div className="card">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
              setResult(null);
              setError(null);
            }}
          />
          <div
            className={`dropzone${dragging ? " active" : ""}${error ? " error" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) {
                setFile(dropped);
                setResult(null);
                setError(null);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
          >
            <div className="dz-icon">
              <Upload width={20} height={20} />
            </div>
            {file ? (
              <>
                <div style={{ fontWeight: 650, fontSize: 13 }}>{file.name}</div>
                <div className="muted text-xs2 mt-8">
                  {(file.size / 1e6).toFixed(2)} MB · click to choose a different file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 650, fontSize: 13 }}>Drop a CSV or Excel file here</div>
                <div className="muted text-xs2 mt-8">or click to browse · .csv, .xlsx, .xlsm up to 80 MB</div>
              </>
            )}
          </div>

          <div className="mini-label" style={{ marginTop: 18 }}>
            How should this be applied?
          </div>
          <div className="row gap-10" style={{ alignItems: "stretch" }}>
            <button
              type="button"
              className={`mode-card${mode === "replace" ? " selected" : ""}`}
              onClick={() => setMode("replace")}
            >
              <h4>Replace entire dataset</h4>
              <p>The uploaded file becomes the whole dataset. Existing data is backed up first.</p>
            </button>
            <button
              type="button"
              className={`mode-card${mode === "merge" ? " selected" : ""}`}
              onClick={() => setMode("merge")}
            >
              <h4>Add to existing</h4>
              <p>Merges and de-duplicates — use this to append a new financial year.</p>
            </button>
          </div>

          <div className="row gap-8" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!file || busy !== null}
              onClick={() => void send(true)}
            >
              {busy === "validate" ? <Loader2 width={13} height={13} className="spin" /> : <CheckCircle2 width={13} height={13} />}
              Validate &amp; preview
            </button>
            <button
              type="button"
              className="btn btn-gradient btn-sm"
              disabled={!file || busy !== null || !validated}
              onClick={() => void send(false)}
              title={validated ? undefined : "Validate first"}
            >
              {busy === "commit" ? <Loader2 width={13} height={13} className="spin" /> : <Upload width={13} height={13} />}
              {mode === "replace" ? "Replace dataset" : "Merge into dataset"}
            </button>
          </div>

          {error ? (
            <div className="insight-card" style={{ background: "var(--danger-bg)", marginTop: 14 }}>
              <XCircle width={15} height={15} style={{ color: "var(--danger)", flexShrink: 0 }} />
              <div className="insight-text" style={{ color: "var(--danger)" }}>{error}</div>
            </div>
          ) : null}

          {committed ? (
            <div className="insight-card" style={{ background: "var(--success-bg)", marginTop: 14 }}>
              <CheckCircle2 width={15} height={15} style={{ color: "var(--success)", flexShrink: 0 }} />
              <div className="insight-text" style={{ color: "var(--success)" }}>
                Dataset updated — {formatNumber(result?.summary?.rows ?? 0)} rows across{" "}
                {formatNumber(result?.summary?.companies ?? 0)} companies. Every page now reads the new data.
              </div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Validation</h3>
              <div className="muted">Runs before anything is written</div>
            </div>
            {result ? (
              <span className={`card-badge ${result.ok ? "" : "rose"}`}>{result.ok ? "Passed" : "Failed"}</span>
            ) : null}
          </div>

          {!result ? (
            <div className="empty-state">
              <h4>Nothing validated yet</h4>
              <p>Choose a file and hit “Validate &amp; preview”. Your current data stays untouched until you confirm.</p>
            </div>
          ) : (
            <>
              {result.checks.map((check) => (
                <div className="check-row" key={check.label}>
                  <span className="ico">
                    {check.status === "ok" ? (
                      <CheckCircle2 width={14} height={14} className="check-ok" />
                    ) : check.status === "warn" ? (
                      <AlertTriangle width={14} height={14} className="check-warn" />
                    ) : (
                      <XCircle width={14} height={14} className="check-bad" />
                    )}
                  </span>
                  <div>
                    <div style={{ fontWeight: 650 }}>{check.label}</div>
                    <div className="muted text-xs2">{check.detail}</div>
                  </div>
                </div>
              ))}

              {result.summary ? (
                <div className="row" style={{ gap: 20, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <Figure label="Rows" value={formatNumber(result.summary.rows)} />
                  <Figure label="Companies" value={formatNumber(result.summary.companies)} />
                  <Figure label="Spend" value={formatCrore(result.summary.totalSpend)} />
                  <Figure label="Years" value={result.summary.years.join(", ") || "—"} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {result?.preview?.length ? (
        <>
          <MiniLabel>Preview — largest 25 projects in the upload</MiniLabel>
          <div className="table-wrap" style={{ marginBottom: 32 }}>
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>FY</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Sector</th>
                  <th>State</th>
                  <th style={{ textAlign: "right" }}>Spent</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, index) => (
                  <tr key={`${row.company}-${index}`}>
                    <td className="cell-strong">{row.company}</td>
                    <td className="mono">{row.year}</td>
                    <td title={row.project ?? undefined}>{truncate(row.project, 60)}</td>
                    <td>
                      <span className="tag">{truncate(row.theme, 22)}</span>
                    </td>
                    <td className="muted">{row.sector}</td>
                    <td className="muted">{row.state}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{formatCrore(row.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <MiniLabel>Expected columns</MiniLabel>
      <div className="card" style={{ marginBottom: 32 }}>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          Only two columns are mandatory. Everything else is matched on a best-effort basis, so header spelling can
          drift between years without breaking the import.
        </p>
        <div className="grid cols-2 gap-16">
          <div>
            <div className="mini-label no-rule">Required</div>
            <Cols items={["Company Name", "Amount Spent (INR Cr.)"]} />
            <div className="mini-label no-rule mt-16">Recognised</div>
            <Cols
              items={[
                "YEAR", "State", "District", "BRSR / Sector", "Thematic area",
                "CSR Project(s)", "Project Amount Outlay (INR Cr.)", "Mode of Implementation", "CIN",
              ]}
            />
          </div>
          <div>
            <div className="mini-label no-rule">Optional — switches extra panels on</div>
            <Cols
              items={[
                "NGO Name / Implementing Agency", "Beneficiaries Reached", "Project Status",
                "Start Date", "End Date", "SDG Goals",
              ]}
            />
            <p className="unavailable-note mt-16">
              A column counts as available once at least 1% of rows are filled, so an empty column never lights up an
              empty chart.
            </p>
          </div>
        </div>
      </div>

      <MiniLabel>Rollback</MiniLabel>
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Previous datasets</h3>
            <div className="muted">The five most recent are kept automatically</div>
          </div>
          <History width={15} height={15} style={{ color: "var(--text-soft)" }} />
        </div>
        {backups.length === 0 ? (
          <div className="empty-state">
            <h4>No backups yet</h4>
            <p>A backup is taken automatically each time you replace or merge.</p>
          </div>
        ) : (
          backups.map((backup) => (
            <div className="rank-row" key={backup.name} style={{ cursor: "default" }}>
              <span className="rank-num">
                <FileSpreadsheet width={11} height={11} />
              </span>
              <div className="rank-main">
                <div className="rank-name">{formatDateTime(backup.savedAt)}</div>
                <div className="rank-meta mono">
                  {backup.name} · {(backup.bytes / 1e6).toFixed(1)} MB
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy !== null}
                onClick={() => void restore(backup.name)}
              >
                <RotateCcw width={12} height={12} />
                Restore
              </button>
            </div>
          ))
        )}
      </div>
    </PageFrame>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="kpi-label">{label}</div>
      <div className="mono truncate1" style={{ fontSize: 14, fontWeight: 700, maxWidth: 220 }} title={value}>
        {value}
      </div>
    </div>
  );
}

function Cols({ items }: { items: string[] }) {
  return (
    <div className="row gap-6" style={{ flexWrap: "wrap" }}>
      {items.map((item) => (
        <code
          key={item}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5, background: "var(--surface-2)",
            border: "1px solid var(--border)", borderRadius: 5, padding: "2px 7px",
          }}
        >
          {item}
        </code>
      ))}
    </div>
  );
}
