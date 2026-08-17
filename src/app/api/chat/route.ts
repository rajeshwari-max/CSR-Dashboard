import { NextResponse } from "next/server";

import { buildFactPack } from "@/lib/insights";
import { answerQuestion as askLlm, llmAvailable, llmModel } from "@/lib/llm";
import { answerQuestion as askLocal, nlqCapabilities } from "@/lib/nlq";
import { describeFilters, paramsToFilters } from "@/lib/query";
import { handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/chat  { question, filters }
 *
 * Answers from the built-in query engine first: it needs no API key, replies in
 * about a millisecond, and every figure it quotes is computed from the fact
 * table rather than generated. An LLM is only consulted when the question falls
 * outside what the parser understands *and* a key happens to be configured.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: string; query?: string };
    const question = (body.question ?? "").trim().slice(0, 500);
    if (!question) {
      return NextResponse.json({ error: "Empty question" }, { status: 400 });
    }

    const filters = paramsToFilters(new URLSearchParams(body.query ?? ""));
    const local = askLocal(question, filters);

    if (local.understood) {
      return NextResponse.json({
        available: true,
        answer: local.answer,
        facts: local.facts,
        model: "built-in query engine",
        source: "deterministic",
      });
    }

    // Not parseable. Hand to the model if one is configured, otherwise return
    // the parser's explanation of what it can answer.
    if (llmAvailable()) {
      const scope = describeFilters(filters) || "All companies, all years";
      const answer = await askLlm(question, buildFactPack(filters, scope));
      return NextResponse.json({
        available: true,
        answer,
        facts: {},
        model: llmModel(),
        source: "llm",
      });
    }

    return NextResponse.json({
      available: true,
      answer: local.answer,
      facts: { supports: nlqCapabilities() },
      model: "built-in query engine",
      source: "deterministic",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
