import { NextResponse } from "next/server";

import { DatasetMissingError } from "@/lib/dataset";

/** Uniform JSON error envelope + dataset-missing detection for every route. */
export function handleRouteError(error: unknown) {
  if (error instanceof DatasetMissingError) {
    return NextResponse.json(
      { error: "Dataset not built", detail: error.message },
      { status: 503 },
    );
  }
  console.error("[api]", error);
  const detail = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: "Internal server error", detail }, { status: 500 });
}

export const CACHE_HEADERS = {
  "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
};
