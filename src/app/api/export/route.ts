import { buildCsv } from "@/lib/dataset";
import { paramsToFilters, parseSort } from "@/lib/query";
import { handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/export — the current filtered view as CSV (UTF-8 BOM so Excel
 * renders ₹ and Indian place names correctly).
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { sort, direction } = parseSort(params);
    const limit = Number.parseInt(params.get("limit") ?? "100000", 10);
    const csv = buildCsv(paramsToFilters(params), sort, direction, Number.isFinite(limit) ? limit : 100_000);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="csr-projects-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
