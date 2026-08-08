"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";

import { formatCrore, formatSignedPercent } from "@/lib/format";
import type { InsightsResponse } from "@/types";

/**
 * Full AI analysis in a side panel. Same payload the AI Insights page uses, so
 * the compact card, the drawer and the page can never disagree.
 */
export function InsightDrawer({
  open,
  onClose,
  data,
  filterQuery,
}: {
  open: boolean;
  onClose: () => void;
  data: InsightsResponse | null;
  filterQuery: string;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Full AI analysis"
          >
            <div className="drawer-head">
              <div>
                <h3 style={{ fontSize: 15 }}>Full AI analysis</h3>
                <div className="muted text-xs2">{data?.scope ?? "Current selection"}</div>
              </div>
              <div className="row gap-8">
                <Link href={`/ai-insights?${filterQuery}`} className="btn btn-outline btn-sm">
                  <ExternalLink width={13} height={13} />
                  Open page
                </Link>
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                  <X width={17} height={17} />
                </button>
              </div>
            </div>

            <div className="drawer-body">
              <div className="mini-label">Executive summary</div>
              <div className="card" style={{ marginBottom: 20 }}>
                {data?.summary.map((line) => (
                  <p key={line} style={{ fontSize: 12.5, margin: "0 0 8px", lineHeight: 1.55 }}>
                    {line}
                  </p>
                ))}
                {data?.llm.narrative ? (
                  <div className="insight-card" style={{ marginTop: 10 }}>
                    <div className="insight-dot purple" />
                    <div className="insight-text" style={{ whiteSpace: "pre-wrap" }}>
                      {data.llm.narrative}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mini-label">Observations</div>
              {data?.insights.map((insight) => (
                <div className="card" key={insight.id} style={{ marginBottom: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                    <div className="insight-title">{insight.title}</div>
                    <span
                      className={`card-badge ${
                        insight.severity === "critical" ? "rose" : insight.severity === "warning" ? "amber" : ""
                      }`}
                    >
                      {insight.kind}
                    </span>
                  </div>
                  <div className="insight-text mt-8">{insight.detail}</div>
                  <div className="row gap-6 mt-8" style={{ flexWrap: "wrap" }}>
                    {insight.evidence.map((item) => (
                      <span key={item.label} className="tag" style={{ background: "var(--surface-2)", color: "var(--text-soft)" }}>
                        {item.label}: <b className="mono" style={{ marginLeft: 4, color: "var(--text)" }}>{item.value}</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {data?.anomalies.length ? (
                <>
                  <div className="mini-label">Anomalies</div>
                  <div className="table-wrap" style={{ marginBottom: 20 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Entity</th>
                          <th>Year</th>
                          <th style={{ textAlign: "right" }}>Previous</th>
                          <th style={{ textAlign: "right" }}>Actual</th>
                          <th style={{ textAlign: "right" }}>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.anomalies.map((row) => (
                          <tr key={`${row.name}-${row.year}`}>
                            <td className="cell-strong">{row.name}</td>
                            <td className="mono">{row.year}</td>
                            <td className="mono" style={{ textAlign: "right" }}>{formatCrore(row.expected)}</td>
                            <td className="mono" style={{ textAlign: "right" }}>{formatCrore(row.value)}</td>
                            <td style={{ textAlign: "right" }}>
                              <span className={`tag ${row.direction === "drop" ? "danger" : ""}`}>
                                {formatSignedPercent(row.deviationPct)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              <div className="mini-label">Recommendations</div>
              {data?.recommendations.map((item) => (
                <div className="insight-card" key={item.title}>
                  <div className="insight-dot amber" />
                  <div>
                    <div className="insight-title">{item.title}</div>
                    <div className="insight-text">{item.detail}</div>
                    <div className="insight-tag mt-8">{item.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
