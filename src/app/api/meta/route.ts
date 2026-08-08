import { NextResponse } from "next/server";

import { getMeta } from "@/lib/dataset";
import { CACHE_HEADERS, handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/meta — filter vocabularies + headline totals for the whole dataset. */
export async function GET() {
  try {
    return NextResponse.json(getMeta(), { headers: CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
