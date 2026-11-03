"use client";

import * as React from "react";
import { Download, Upload } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

/** Upload for annual-report CSR annexure data (financials / implementing partners). */
export function UploadPanel({ kind, title, what, onDone }: { kind: "financials" | "partners"; title: string; what: string; onDone: () => void }) {
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
