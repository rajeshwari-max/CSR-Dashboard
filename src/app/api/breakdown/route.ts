import { NextResponse } from "next/server";

import { buildBreakdown, getDataset } from "@/lib/dataset";
import { cached } from "@/lib/cache";
import { paramsToFilters } from "@/lib/query";
import type { Dimension } from "@/types";
import { CACHE_HEADERS, handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

const DIMENSIONS: Dimension[] = ["company", "sector", "state", "district", "theme", "mode", "year"];

/**
 * GET /api/breakdown?dimension=state
 * Generic group-by powering the State / Sector / Implementation / Project pages:
 * spend, project count, distinct companies, per-year series and YoY growth.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const requested = (params.get("dimension") ?? "state") as Dimension;
    if (!DIMENSIONS.includes(requested)) {
      return NextResponse.json(
        { error: "Unknown dimension", detail: `Expected one of ${DIMENSIONS.join(", ")}` },
        { status: 400 },
      );
    }
    const limit = Number.parseInt(params.get("limit") ?? "500", 10);
    const size = Number.isFinite(limit) ? Math.min(limit, 2000) : 500;
    const payload = cached(`breakdown:${getDataset().generatedAt}:${params.toString()}:${size}`, () =>
      buildBreakdown(paramsToFilters(params), requested, size),
    );
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
