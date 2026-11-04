/**
 * Optional LLM layer.
 *
 * The dashboard is fully functional without this: every number comes from
 * lib/insights.ts. When an API key is present the model is used only to
 * *narrate* or *answer questions about* a fact pack that has already been
 * computed — it is explicitly told not to invent figures.
 *
 * Configure in .env.local:
 *   LLM_PROVIDER=anthropic|openai
 *   LLM_API_KEY=sk-...
 *   LLM_MODEL=claude-sonnet-5           (optional)
 *   LLM_DAILY_LIMIT=100                 (optional; max model calls per day)
 *
 * Cost control (hybrid mode): the built-in engine answers first; the model is
 * only called when that fails or the user explicitly asks for it. Model
 * answers are cached for 24 h per (dataset, question, filters), and calls stop
 * once LLM_DAILY_LIMIT is reached for the day (IST), falling back to the
 * built-in engine.
 */

const PROVIDER = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
const API_KEY = process.env.LLM_API_KEY ?? "";
const MODEL =
  process.env.LLM_MODEL ?? (PROVIDER === "openai" ? "gpt-4o-mini" : "claude-sonnet-5");

export function llmAvailable(): boolean {
  return Boolean(API_KEY);
}

export function llmModel(): string | null {
  return llmAvailable() ? MODEL : null;
}

const DAILY_LIMIT = Math.max(0, Number.parseInt(process.env.LLM_DAILY_LIMIT ?? "100", 10) || 0);
const ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED = 400;

interface Budget { day: string; used: number }
interface LlmState { budget: Budget; answers: Map<string, { text: string; at: number }> }

function state(): LlmState {
  const g = globalThis as unknown as { __csrLlm?: LlmState };
  if (!g.__csrLlm) g.__csrLlm = { budget: { day: "", used: 0 }, answers: new Map() };
  return g.__csrLlm;
}

function today(): string {
  // Day boundary in India time, so the limit resets at local midnight.
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Calls left today, or null when there is no limit. */
export function llmCallsLeft(): number | null {
  if (!DAILY_LIMIT) return null;
  const { budget } = state();
  if (budget.day !== today()) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - budget.used);
}

export function llmWithinBudget(): boolean {
  const left = llmCallsLeft();
  return left === null || left > 0;
}

/**
 * Run a model call through the 24 h answer cache and the daily limit.
 * Returns null when the limit is used up (caller falls back to the engine).
 */
export async function cachedLlm(key: string, run: () => Promise<string>): Promise<{ text: string; cached: boolean } | null> {
  const s = state();
  const hit = s.answers.get(key);
  if (hit && Date.now() - hit.at < ANSWER_TTL_MS) return { text: hit.text, cached: true };
  if (!llmWithinBudget()) return null;

  if (s.budget.day !== today()) s.budget = { day: today(), used: 0 };
  s.budget.used += 1;
  const text = await run();
  s.answers.set(key, { text, at: Date.now() });
  while (s.answers.size > MAX_CACHED) s.answers.delete(s.answers.keys().next().value as string);
  return { text, cached: false };
}

const SYSTEM_PROMPT = [
  "You are a CSR (Corporate Social Responsibility) data analyst assistant for an Indian CSR spent dashboard.",
  "You are given a JSON fact pack computed directly from the dataset. Rules:",
  "1. Use ONLY numbers present in the fact pack. Never estimate, extrapolate or recall figures from memory.",
  "2. If the fact pack does not contain what is needed, say so plainly and name the filter or column that would answer it.",
  "3. All amounts are INR Crore. Format as '₹1,234 Cr'.",
  "4. Respect the stated data caveats — especially that project outlay is not summable and that a large share of amount spent is filed as 'Pan India'.",
  "5. Be concise and specific: short paragraphs, no bullet-point padding, no restating the question.",
].join("\n");

async function callAnthropic(prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { content?: { type: string; text?: string }[] };
  return (body.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim();
}

async function callOpenAi(prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return (body.choices?.[0]?.message?.content ?? "").trim();
}

export async function askLlm(prompt: string, maxTokens = 700): Promise<string> {
  if (!llmAvailable()) throw new Error("No LLM API key configured");
  return PROVIDER === "openai" ? callOpenAi(prompt, maxTokens) : callAnthropic(prompt, maxTokens);
}

export async function narrateInsights(facts: unknown): Promise<string> {
  return askLlm(
    "Write a 3-4 sentence executive briefing for a CSR programme head based on this fact pack. " +
      "Lead with what changed, then the single most decision-relevant risk or gap.\n\n" +
      JSON.stringify(facts),
    600,
  );
}

export async function answerQuestion(question: string, facts: unknown): Promise<string> {
  return askLlm(
    `Question: ${question}\n\nFact pack:\n${JSON.stringify(facts)}\n\n` +
      "Answer using only these figures. If the answer is not derivable, say which filter or column is needed.",
    700,
  );
}
