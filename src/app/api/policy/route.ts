import { NextResponse } from "next/server";

import { buildPolicyInsights } from "@/lib/policy";
import { paramsToFilters } from "@/lib/query";
import { handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/policy — coverage, ownership, aspirational, focus tags, uploaded financials and partners. */
export async function GET(request: Request) {
  try {
    const filters = paramsToFilters(new URL(request.url).searchParams);
    return NextResponse.json(buildPolicyInsights(filters), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
