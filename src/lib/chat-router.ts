/**
 * Hybrid question routing for the AI Insights chat.
 *
 * The built-in engine (lib/nlq.ts) is free, instant and exact, but it only
 * understands a fixed set of question shapes. When a question falls outside
 * them it can still return `understood: true` with an answer to a *different*
 * question (e.g. "Compare Maharashtra and Gujarat" → Maharashtra only). These
 * rules were written by running a test set of questions through the engine
 * and noting every shape it got wrong; those shapes go to the model.
 */

import { buildSummary, getDataset } from "@/lib/dataset";
import { buildFactPack } from "@/lib/insights";
import { findCompany, type NlqAnswer } from "@/lib/nlq";
import { buildPolicyInsights } from "@/lib/policy";
import type { Filters } from "@/types";

export type Route =
  | { use: "engine"; reason: string }
  | { use: "model"; reason: string }
  | { use: "greeting" };

const GREETING = /^\s*(hi|hello|hey|hii+|namaste|good (morning|afternoon|evening)|thanks?( you)?|thank you|ok(ay)?|cool)\s*[.!?]*\s*$/i;

/** Question shapes the engine is known to answer wrongly or not at all. */
const MODEL_RULES: { pattern: RegExp; reason: string }[] = [
  // Reasoning and advice: the engine only returns figures.
  { pattern: /\b(why|explain|reason|cause[sd]?|because|what drove|driver)/i, reason: "asks for an explanation" },
  { pattern: /\b(recommend|suggest|should|advise|advice|opportunit|strategy|strategic|focus on|priorit|what if|plan for)/i, reason: "asks for advice" },
  { pattern: /\b(gap|gaps|underserved|under-served|neglect|need is|needs? (more|most)|low but|high but)/i, reason: "asks about gaps or need" },
  { pattern: /\b(summari[sz]e|overview|key (takeaway|finding|insight)s?|insights?\b|brief me|tell me everything)/i, reason: "asks for a summary" },
  // Data the engine does not read (annexure financials and partners).
  { pattern: /\b(unspent|obligation amount|prescribed|transferred to|unspent account|schedule vii fund|overhead|impact assessment)/i, reason: "needs annexure financials" },
  { pattern: /\b(ngo|ngos|implementing agenc|agency|agencies|partner|partners|foundation(s)? (they|it) (fund|work))/i, reason: "needs implementing-partner data" },
  // Ownership split is not modelled by the engine.
  { pattern: /\b(psu|psus|public sector|government[- ]owned|state[- ]owned|private (sector|compan)|mnc|multinational|ownership)/i, reason: "needs the ownership split" },
  // Numeric thresholds ("more than 100 crore") are ignored by the engine.
  { pattern: /\b(more than|less than|greater than|fewer than|above|below|over|under|at least|at most|exceed)\s*₹?\s*\d/i, reason: "has a numeric threshold" },
  // The engine's concentration answer is about companies only.
  { pattern: /\b(concentrat|spread|distribut|skew|inequal).*\b(state|states|sector|sectors|district|districts|region|categor|theme)/i, reason: "asks about concentration across states or sectors" },
  // Ratios the engine does not compute.
  { pattern: /\b(average|mean|median|per project|per company|ratio|percentage of|what percent|what share|how much of)/i, reason: "asks for a ratio" },
];

function namedStates(question: string): string[] {
  const lower = ` ${question.toLowerCase()} `;
  return getDataset().states.filter((s) => s.length >= 4 && !/^pan india|not specified/i.test(s) && lower.includes(s.toLowerCase()));
}

function namedCompanies(question: string, limit = 3): number[] {
  const found: number[] = [];
  let text = question;
  for (let i = 0; i < limit; i += 1) {
    const match = findCompany(text);
    if (!match || found.includes(match.index)) break;
    found.push(match.index);
    text = ` ${text.toLowerCase()} `.replace(new RegExp(`\\b${match.matched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " ");
  }
  return found;
}

/** Decide who answers: the free engine, or the model. */
export function routeQuestion(question: string, local: NlqAnswer): Route {
  if (GREETING.test(question)) return { use: "greeting" };
  if (!local.understood) return { use: "model", reason: "engine could not read the question" };

  // Two-category comparisons ("education vs health") are a shape the engine handles well.
  const engineCompared = Array.isArray((local.facts as { comparison?: unknown }).comparison);

  for (const rule of MODEL_RULES) if (rule.pattern.test(question)) return { use: "model", reason: rule.reason };

  // Two or more states or companies named: the engine answers about only one.
  if (!engineCompared && (namedStates(question).length >= 2 || namedCompanies(question).length >= 2)) {
    return { use: "model", reason: "compares several named items" };
  }
  if (!engineCompared && /\b(compare|comparison|versus|vs\.?|difference between|better than|than)\b/i.test(question)) {
    return { use: "model", reason: "asks for a comparison" };
  }

  // "Top 5/10/20 …" — the engine always lists three.
  const topN = /\b(?:top|bottom|best|worst|largest|smallest|first)\s+(\d{1,2})\b/i.exec(question);
  if (topN && Number(topN[1]) > 3) return { use: "model", reason: "asks for more than three items" };
  if (/\b(list all|all (the )?companies|every company|full list)\b/i.test(question)) return { use: "model", reason: "asks for a full list" };

  // A specific year asked for, but the engine replied with the multi-year trend.
  if (/\bFY\s?\d{2,4}/i.test(question) && /FY [\d-]+: ₹[\d,.]+ Cr · FY/.test(local.answer) && !/\b(trend|over time|each year|yearly|by year)\b/i.test(question)) {
    return { use: "model", reason: "asks about one year, engine returned the trend" };
  }

  // Signs the engine answered something else.
  if (/Then \.\s*$/.test(local.answer) || /No projects match .* in .* in the current selection/.test(local.answer)) {
    return { use: "model", reason: "engine answer looks malformed" };
  }
  const company = findCompany(question);
  if (company && company.matched.trim().split(/\s+/).length === 1) {
    // A one-word company match that is also an ordinary CSR word ("care", "water", "power")
    // is usually a misread — e.g. "health care" matching Care Ratings Limited.
    const word = company.matched.trim().toLowerCase();
    const data = getDataset();
    const generic = [...data.themes, ...data.sectors].some((name) => name.toLowerCase().split(/[^a-z]+/).includes(word));
    if (generic) return { use: "model", reason: "company name may be a misread common word" };
  }

  return { use: "engine", reason: "engine understood the question" };
}

export const GREETING_REPLY =
  "Hello! Ask me about CSR spending in this selection, for example “Which state received the most CSR in FY 2024-25?”, " +
  "“How much did Infosys spend on education?” or “Why did CSR fall in Andhra Pradesh?”.";

/**
 * Fact pack for the model: the standard pack plus the data the engine cannot
 * use (annexure financials, partners, ownership) and a summary for every state
 * or company the question names, so comparisons are answered from real figures.
 */
export function buildChatFactPack(question: string, filters: Filters, scope: string) {
  const data = getDataset();
  const pack = buildFactPack(filters, scope) as Record<string, unknown>;
  const summaryWide = buildSummary(filters, 25);
  pack.topCompanies = summaryWide.topCompanies.map((row) => ({ name: row.name, spend: row.value, share: row.share, projects: row.count }));

  try {
    const policy = buildPolicyInsights(filters);
    pack.ownership = policy.ownership.map((row) => ({ name: row.name, spend: row.value, share: row.share, companies: row.companies, projects: row.count }));
    if (policy.financials) {
      const f = policy.financials;
      pack.annexureFinancials = {
        source: "Companies' annual-report CSR annexures (NSE filings)",
        companies: f.companies, obligation: f.obligation, totalSpent: f.totalSpent, unspent: f.unspent,
        toUnspentAccount: f.toUnspentAccount, overheads: f.overheads, impactAssessmentSpend: f.impact,
        byYear: f.byYear, topUnspentCompanies: f.topUnspent,
      };
    }
    if (policy.partners) {
      const p = policy.partners;
      pack.implementingPartners = {
        source: "Companies' annual-report CSR annexures (NSE filings)",
        agencies: p.implementers, companies: p.companies,
        topAgenciesByCompanies: p.top.map((a) => ({ name: a.name, companies: a.companies, registration: a.registration })),
      };
    }
  } catch {
    // Annexure data is optional; the pack stays valid without it.
  }

  const entities: Record<string, unknown>[] = [];
  const describe = (label: string, f: Filters) => {
    const s = buildSummary(f, 5);
    entities.push({
      name: label,
      totalSpend: s.kpis.totalSpend, projects: s.kpis.projectCount, companies: s.kpis.companyCount,
      yoyGrowthPct: s.kpis.yoyGrowthPct, latestYear: s.kpis.latestYear,
      trend: s.trend.map((t) => ({ year: t.year, spend: t.spend, projects: t.projects })),
      topThemes: s.byTheme.slice(0, 5).map((r) => ({ name: r.name, spend: r.value })),
      topCompanies: s.topCompanies.slice(0, 5).map((r) => ({ name: r.name, spend: r.value })),
      topStates: s.byState.slice(0, 5).map((r) => ({ name: r.name, spend: r.value })),
    });
  };
  for (const state of namedStates(question).slice(0, 4)) describe(state, { ...filters, states: [state] });
  for (const index of namedCompanies(question)) describe(data.companies[index].name, { ...filters, companies: [data.companies[index].id] });
  if (entities.length) pack.namedInQuestion = entities;

  return pack;
}
