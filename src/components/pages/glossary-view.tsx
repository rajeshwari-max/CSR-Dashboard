"use client";

import * as React from "react";

import { PageFrame } from "@/components/shell/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";

/** Plain definitions of the CSR terms used across the dashboard. */
const TERMS: { term: string; meaning: string; link?: { href: string; label: string } }[] = [
  { term: "CSR Obligation", meaning: "Amount a company is required to spend towards CSR under applicable provisions of the Companies Act." },
  { term: "CSR Expenditure", meaning: "Amount reported as spent by the company towards CSR activities." },
  { term: "Unspent CSR", meaning: "CSR amount reported as unspent, subject to applicable statutory provisions and classifications." },
  { term: "Implementing Agency", meaning: "Organisation or entity responsible for implementing a CSR project." },
  { term: "Aspirational District", meaning: "District identified under the Government of India's Aspirational Districts Programme." },
  {
    term: "Development Domain",
    meaning: "Broad thematic area in which CSR projects are implemented.",
    link: { href: "https://ies.gov.in/arthapedia/concept/corporate-social-responsibility-csr", label: "Schedule VII, Companies Act 2013" },
  },
  { term: "Project Location", meaning: "State and district where a CSR project is reported to be implemented." },
];

export function GlossaryView() {
  const { filters } = useDashboardFilters();
  const meta = useMeta();
  return (
    <PageFrame
      title="Glossary"
      subtitle="What the CSR terms used in this dashboard mean."
      meta={meta.data}
      filters={filters}
      showFilters={false}
    >
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th style={{ textAlign: "left", padding: "12px 18px", width: "28%" }}>Term</th>
              <th style={{ textAlign: "left", padding: "12px 18px" }}>Explanation</th>
            </tr>
          </thead>
          <tbody>
            {TERMS.map((row) => (
              <tr key={row.term} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 18px", fontWeight: 650, verticalAlign: "top" }}>{row.term}</td>
                <td style={{ padding: "12px 18px", lineHeight: 1.55 }}>
                  {row.meaning}
                  {row.link ? (
                    <>
                      {" "}
                      <a href={row.link.href} target="_blank" rel="noreferrer" style={{ color: "var(--c1)", textDecoration: "underline" }}>{row.link.label}</a>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
        <a href="https://www.csr.gov.in" target="_blank" rel="noreferrer" style={{ color: "var(--c1)", textDecoration: "underline", fontWeight: 600 }}>
          Learn more
        </a>{" "}
        about these definitions on the MCA National CSR Portal.
      </p>
    </PageFrame>
  );
}
