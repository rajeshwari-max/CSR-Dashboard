import { NextResponse } from "next/server";

import { buildChatFactPack, GREETING_REPLY, routeQuestion } from "@/lib/chat-router";
import { getDataset } from "@/lib/dataset";
import { answerQuestion as askLlm, cachedLlm, llmAvailable, llmModel } from "@/lib/llm";
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
 * the engine is known to get wrong (see lib/chat-router.ts) *and* a key is
 * configured — and then through a 24 h cache and a daily limit.
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
    const route = routeQuestion(question, local);

    if (route.use === "greeting") {
      return NextResponse.json({ available: true, answer: GREETING_REPLY, facts: {}, model: "built-in query engine", source: "deterministic" });
    }

    // 1. The built-in engine can answer this shape correctly: free, instant, exact.
    if (route.use === "engine" || !llmAvailable()) {
      return NextResponse.json({
        available: true,
        answer: local.answer,
        facts: local.understood ? local.facts : { supports: nlqCapabilities() },
        model: "built-in query engine",
        source: "deterministic",
        route: route.use === "engine" ? route.reason : "no model configured",
      });
    }

    // 2. A shape the engine gets wrong: the model answers, from a fact pack
    //    built for this question, through the 24 h cache and the daily limit.
    const scope = describeFilters(filters) || "All companies, all years";
    const key = `chat:${getDataset().generatedAt}:${llmModel()}:${question.toLowerCase().replace(/\s+/g, " ")}:${body.query ?? ""}`;
    const result = await cachedLlm(key, () => askLlm(question, buildChatFactPack(question, filters, scope)));

    if (!result) {
      return NextResponse.json({
        available: true,
        answer:
          local.answer +
          "\n\n(Today's AI question limit has been reached, so this answer comes from the built-in engine and may be partial. It resets at midnight.)",
        facts: local.facts,
        model: "built-in query engine",
        source: "deterministic",
        limited: true,
        route: route.reason,
      });
    }

    return NextResponse.json({
      available: true,
      answer: result.text,
      facts: {},
      model: llmModel(),
      source: "llm",
      cached: result.cached,
      route: route.reason,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
