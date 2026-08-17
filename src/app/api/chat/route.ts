import { NextResponse } from "next/server";

import { buildFactPack } from "@/lib/insights";
import { answerQuestion, llmAvailable, llmModel } from "@/lib/llm";
import { describeFilters, paramsToFilters } from "@/lib/query";
import { handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/chat  { question, filters }
 * Grounded Q&A: the model only ever sees a fact pack computed from the current
 * filter selection. Without an API key this returns available:false and the UI
 * falls back to the deterministic insight cards.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: string; query?: string };
    const question = (body.question ?? "").trim().slice(0, 500);
    if (!question) {
      return NextResponse.json({ error: "Empty question" }, { status: 400 });
    }

    const filters = paramsToFilters(new URLSearchParams(body.query ?? ""));
    const scope = describeFilters(filters) || "All companies, all years";
    const facts = buildFactPack(filters, scope);

    if (!llmAvailable()) {
      return NextResponse.json({
        available: false,
        answer:
          "Natural-language chat needs an LLM key. Set the LLM_API_KEY environment variable " +
          "(and optionally LLM_PROVIDER / LLM_MODEL), then restart the service. On Render that is " +
          "Settings → Environment. Every insight card on this page works without it.",
        facts,
        model: null,
      });
    }

    const answer = await answerQuestion(question, facts);
    return NextResponse.json({ available: true, answer, facts, model: llmModel() });
  } catch (error) {
    return handleRouteError(error);
  }
}
