import { NextResponse } from "next/server";

import { buildCompanyDetail, getDataset } from "@/lib/dataset";
import { cached } from "@/lib/cache";
import { paramsToFilters } from "@/lib/query";
import { CACHE_HEADERS, handleRouteError } from "../../_lib";

export const dynamic = "force-dynamic";

/** GET /api/companies/:id — drill-down payload for one company. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const detail = cached(`company:${getDataset().generatedAt}:${id}:${params.toString()}`, () =>
      buildCompanyDetail(decodeURIComponent(id), paramsToFilters(params)),
    );
    if (!detail) {
      return NextResponse.json({ error: "Company not found", detail: id }, { status: 404 });
    }
    return NextResponse.json(detail, { headers: CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
