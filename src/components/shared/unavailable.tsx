"use client";

import { DatabaseZap, Lock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface UnavailableProps {
  title: string;
  /** Which source column would switch this panel on. */
  column: string;
  description?: string;
  headers?: string[];
  height?: number;
  className?: string;
}

/**
 * Honest empty state for panels the mockup asks for but the workbook cannot
 * back yet. It names the exact column the ETL looks for, so switching the
 * panel on is a spreadsheet edit rather than a code change.
 */
export function Unavailable({
  title,
  column,
  description,
  headers,
  height = 260,
  className,
}: UnavailableProps) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Lock className="size-4" />
            {title}
          </CardTitle>
          <CardDescription>{description ?? "Not available in the current dataset"}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div
          style={{ minHeight: height }}
          className="flex flex-col items-center justify-center gap-3 rounded-lg bg-muted/40 p-6 text-center"
        >
          <DatabaseZap className="size-6 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">
            The source workbook has no <span className="font-medium text-foreground">{column}</span> column, so
            this panel would have nothing truthful to show.
          </p>
          {headers?.length ? (
            <div className="max-w-md text-xs text-muted-foreground">
              <p className="mb-1.5">
                Add a column with any of these headers, then run{" "}
                <code className="rounded bg-muted px-1 py-0.5">npm run etl</code> — the panel switches itself on:
              </p>
              <div className="flex flex-wrap justify-center gap-1">
                {headers.map((header) => (
                  <code key={header} className="rounded bg-card px-1.5 py-0.5 text-[11px] shadow-sm">
                    {header}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
