import { NextResponse } from "next/server";

import {
  ReportDependencyError,
  buildCsvReport,
  buildExcelReport,
  buildPdfReport,
  buildPptxReport,
  reportStamp,
} from "@/lib/reports/builders";
import { paramsToFilters } from "@/lib/query";
import { handleRouteError } from "../../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv; charset=utf-8",
};

/** GET /api/report/pdf|xlsx|pptx|csv — the current filtered view as a document. */
export async function GET(request: Request, context: { params: Promise<{ format: string }> }) {
  try {
    const { format } = await context.params;
    const key = format.toLowerCase();
    if (!TYPES[key]) {
      return NextResponse.json(
        { error: "Unsupported format", detail: `Expected one of ${Object.keys(TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    const filters = paramsToFilters(new URL(request.url).searchParams);
    const filename = `csr-report-${reportStamp()}.${key}`;

    let body: Uint8Array | string;
    if (key === "pdf") body = await buildPdfReport(filters);
    else if (key === "xlsx") body = new Uint8Array(await buildExcelReport(filters));
    else if (key === "pptx") body = new Uint8Array(await buildPptxReport(filters));
    else body = `﻿${buildCsvReport(filters)}`;

    return new Response(body as unknown as BodyInit, {
      headers: {
        "content-type": TYPES[key],
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ReportDependencyError) {
      // Missing install rather than a bug — say exactly what to run.
      return NextResponse.json(
        { error: "Report dependency missing", detail: error.message },
        { status: 503 },
      );
    }
    return handleRouteError(error);
  }
}
