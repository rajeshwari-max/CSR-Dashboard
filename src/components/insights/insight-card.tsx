"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Maximize2, Sparkles } from "lucide-react";

import { InsightDrawer } from "@/components/insights/insight-drawer";
import type { Insight, InsightsResponse } from "@/types";

const DOT_CLASS = ["teal", "amber", "blue", "purple"] as const;

/**
 * Compact "AI-generated insights" card exactly as positioned in the draft:
 * four one-line observations plus a full-width action. The complete analysis
 * lives behind "View full analysis", which opens a side drawer — the dashboard
 * never gets taken over by it.
 */
export function AiInsightCard({
  data,
  isLoading,
  filterQuery,
}: {
  data: InsightsResponse | null;
  isLoading: boolean;
  filterQuery: string;
}) {
  const [open, setOpen] = React.useState(false);

  // Pick the four most decision-relevant cards for the compact view.
  const priority: Insight["kind"][] = ["trend", "anomaly", "concentration", "gap"];
  const headline = React.useMemo(() => {
    if (!data) return [];
    const picked: Insight[] = [];
    for (const kind of priority) {
      const match = data.insights.find((insight) => insight.kind === kind && !picked.includes(insight));
      if (match) picked.push(match);
    }
    for (const insight of data.insights) {
      if (picked.length >= 4) break;
      if (!picked.includes(insight)) picked.push(insight);
    }
    return picked.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      <div className="card hoverable stack" style={{ height: "100%" }}>
        <div className="card-head">
          <div>
            <h3>AI-generated insights</h3>
            <div className="muted">Computed from the current selection</div>
          </div>
          <span className="card-badge purple">
            <Sparkles width={9} height={9} style={{ marginRight: 3, display: "inline" }} />
            Auto
          </span>
        </div>

        {isLoading ? (
          <div className="stack gap-8">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton" style={{ height: 44 }} />
            ))}
          </div>
        ) : headline.length === 0 ? (
          <div className="empty-state">
            <h4>No insights yet</h4>
            <p>Upload a dataset or widen the filters.</p>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            {headline.map((insight, index) => (
              <div className="insight-item" key={insight.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <span className={`insight-dot ${DOT_CLASS[index % DOT_CLASS.length]}`} />
                <div style={{ minWidth: 0 }}>
                  <div className="insight-title truncate1">{insight.title}</div>
                  <div className="insight-text" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {insight.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="row gap-8" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-gradient btn-sm btn-block" onClick={() => setOpen(true)}>
            <Maximize2 width={13} height={13} />
            View full analysis
          </button>
          <Link href={`/ai-insights?${filterQuery}`} className="btn btn-outline btn-sm" title="Open the AI Insights page">
            <ArrowRight width={13} height={13} />
          </Link>
        </div>
      </div>

      <InsightDrawer open={open} onClose={() => setOpen(false)} data={data} filterQuery={filterQuery} />
    </>
  );
}
