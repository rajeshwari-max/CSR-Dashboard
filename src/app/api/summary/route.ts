import { NextResponse } from "next/server";

import { buildSummary, getDataset } from "@/lib/dataset";
import { cached } from "@/lib/cache";
import { paramsToFilters } from "@/lib/query";
import { CACHE_HEADERS, handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/summary
 * KPIs + every chart series for the current filter selection, in one round trip.
 * Query: years|sectors|states|themes|companies (pipe separated), search, top
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const top = Number.parseInt(params.get("top") ?? "12", 10);
    const limit = Number.isFinite(top) ? Math.min(top, 50) : 12;
    // Pure function of (dataset, query) — memoised so repeat views are instant.
    const summary = cached(`summary:${getDataset().generatedAt}:${params.toString()}:${limit}`, () =>
      buildSummary(paramsToFilters(params), limit),
    );
    return NextResponse.json(summary, { headers: CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
