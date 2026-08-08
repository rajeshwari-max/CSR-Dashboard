"use client";

import * as React from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Table2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiRequestError, downloadFile } from "@/lib/api";

export const REPORT_FORMATS = [
  { key: "pdf", label: "PDF report", icon: FileText, hint: "Branded executive summary" },
  { key: "xlsx", label: "Excel workbook", icon: FileSpreadsheet, hint: "9 sheets incl. full register" },
  { key: "pptx", label: "PowerPoint deck", icon: Presentation, hint: "8 slides with charts" },
  { key: "csv", label: "CSV register", icon: Table2, hint: "Flat filtered rows" },
] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number]["key"];

export function ExportMenu({
  filterQuery,
  size = "sm",
  label = "Download",
}: {
  filterQuery: string;
  size?: "sm" | "default";
  label?: string;
}) {
  const [busy, setBusy] = React.useState<ReportFormat | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const download = async (format: ReportFormat) => {
    setBusy(format);
    setError(null);
    try {
      await downloadFile(
        `/api/report/${format}?${filterQuery}`,
        `csr-report-${new Date().toISOString().slice(0, 10)}.${format}`,
      );
    } catch (cause) {
      // Never let this reject unhandled: an unhandled rejection here shows up
      // as a full-screen Next.js error overlay in dev instead of a message.
      setError(
        cause instanceof ApiRequestError
          ? (cause.detail ?? cause.message)
          : cause instanceof Error
            ? cause.message
            : "Report generation failed",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Download current view</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {REPORT_FORMATS.map((format) => {
            const Icon = format.icon;
            return (
              <DropdownMenuItem
                key={format.key}
                onSelect={() => void download(format.key)}
                className="gap-2.5 py-2"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium">{format.label}</span>
                  <span className="text-[11px] text-muted-foreground">{format.hint}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {error ? (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-destructive/40 bg-popover p-3 text-xs shadow-pop">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-destructive">Report generation failed</p>
              <p className="mt-1 break-words text-muted-foreground">{error}</p>
            </div>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              <X className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
