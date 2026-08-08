import { NextResponse } from "next/server";

import { buildProjects, getDataset } from "@/lib/dataset";
import { cached } from "@/lib/cache";
import { paramsToFilters, parsePagination, parseSort } from "@/lib/query";
import { CACHE_HEADERS, handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Server-side paginated, sorted, searchable project rows.
 * Query: filters + page, pageSize (5-200), sort, direction
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { page, pageSize } = parsePagination(params);
    const { sort, direction } = parseSort(params);
    const payload = cached(
      `projects:${getDataset().generatedAt}:${params.toString()}`,
      () => buildProjects(paramsToFilters(params), { page, pageSize, sort, direction }),
    );
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
