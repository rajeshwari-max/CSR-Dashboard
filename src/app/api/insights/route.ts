import { NextResponse } from "next/server";

import { buildFactPack, buildInsights } from "@/lib/insights";
import { getDataset } from "@/lib/dataset";
import { cached } from "@/lib/cache";
import { llmAvailable, llmModel, narrateInsights } from "@/lib/llm";
import { describeFilters, paramsToFilters } from "@/lib/query";
import { CACHE_HEADERS, handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/insights?...&narrate=1
 * Deterministic insight engine. Every figure is computed from the fact table;
 * `narrate=1` additionally asks the configured LLM to write a briefing over
 * those same figures (no-op when no API key is set).
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const filters = paramsToFilters(params);
    const scope = describeFilters(filters) || "All companies, all years";
    const base = cached(`insights:${getDataset().generatedAt}:${params.toString()}`, () =>
      buildInsights(filters, scope),
    );

    let narrative: string | null = null;
    if (params.get("narrate") === "1" && llmAvailable()) {
      try {
        narrative = await narrateInsights(buildFactPack(filters, scope));
      } catch (error) {
        console.error("[insights] LLM narration failed", error);
      }
    }

    return NextResponse.json(
      { ...base, llm: { available: llmAvailable(), narrative, model: llmModel() } },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
