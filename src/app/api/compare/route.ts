import { NextResponse } from "next/server";

import { buildComparison } from "@/lib/dataset";
import { paramsToFilters } from "@/lib/query";
import { CACHE_HEADERS, handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/compare?companies=a|b|c — side-by-side company benchmarking (max 6). */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const ids = (params.get("companies") ?? "").split("|").map((v) => v.trim()).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ error: "No companies given", detail: "Pass ?companies=id|id" }, { status: 400 });
    }
    const filters = paramsToFilters(params);
    return NextResponse.json(buildComparison(ids, { years: filters.years }), { headers: CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
