"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  FolderKanban,
  IndianRupee,
  Minus,
  MapPinned,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import { formatCrore, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";
import type { Kpis, Meta } from "@/types";

/**
 * The draft's 6-up KPI row, in the drafted order:
 *   Total CSR Spend · Companies Reporting · Active Projects ·
 *   Beneficiaries Reached · Compliance Rate · Avg. Spend / Company
 *
 * Beneficiaries and Compliance have no backing column in the CSR workbook, so
 * they hold their drafted position and render "—" with the column that would
 * switch them on. They light up automatically once that column is uploaded.
 */

interface KpiSpec {
  label: string;
  value: string;
  sub: React.ReactNode;
  delta?: number | null;
  unavailable?: string;
  icon: React.ElementType;
  tip?: string;
}

export function KpiRow({
  kpis,
  meta,
  isLoading,
  onSelect,
}: {
  kpis: Kpis | null;
  meta: Meta | null;
  isLoading: boolean;
  onSelect?: (key: string) => void;
}) {
  if (isLoading || !kpis) {
    return (
      <div className="kpi-row">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="kpi-card" key={index}>
            <div className="skeleton" style={{ height: 11, width: "60%", marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 20, width: "75%", marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 28 }} />
          </div>
        ))}
      </div>
    );
  }

  const beneficiaries = meta?.capabilities.beneficiaries ?? false;
  const cards: KpiSpec[] = [
    {
      label: "Total CSR Spend",
      value: formatCrore(kpis.totalSpend),
      sub: `${kpis.latestYear ?? "—"}, all reporting`,
      delta: kpis.yoyGrowthPct,
      icon: IndianRupee,
    },
    {
      label: "Companies Reporting",
      value: formatNumber(kpis.companyCount),
      sub: `${kpis.sectorCount} sectors`,
      icon: Building2,
    },
    {
      label: "Active Projects",
      value: formatNumber(kpis.projectCount),
      sub: `Across ${kpis.stateCount} states`,
      icon: FolderKanban,
    },
    beneficiaries
      ? {
          label: "Beneficiaries Reached",
          value: formatNumber(kpis.beneficiaries ?? 0),
          sub: "Across all reported projects",
          icon: Users,
        }
      : {
          // No beneficiary column in the dataset, so this slot shows geographic
          // depth instead of a dash. It switches back automatically the moment
          // a "Beneficiaries Reached" column is uploaded.
          label: "Districts Reached",
          value: formatNumber(kpis.districtCount),
          sub: `${kpis.stateCount} states and UTs`,
          icon: MapPinned,
        },
    {
      // Computed: share of companies whose latest-year spend reached at least
      // 95% of their disclosed 2%-of-net-profit obligation.
      label: "Compliance Rate",
      value: kpis.complianceRate === null ? "—" : formatPercent(kpis.complianceRate, 0),
      sub:
        kpis.complianceBase > 0
          ? `${formatNumber(kpis.complianceMet)} of ${formatNumber(kpis.complianceBase)} disclosing filers`
          : "No obligation disclosed in view",
      icon: ShieldCheck,
      tip: "Share of companies in view that spent at least 95% of their disclosed CSR obligation in the latest year. Measured on each company's national total (an obligation is a whole-company figure), and filers that disclose no obligation are excluded from both sides.",
    },
    {
      label: "Avg. Spend / Company",
      value: formatCrore(kpis.avgSpendPerCompany),
      sub: `Median ${formatCrore(kpis.medianSpendPerCompany)}`,
      icon: Wallet,
    },
  ];

  return (
    <div className="kpi-row">
      {cards.map((card, index) => {
        const dimmed = Boolean(card.unavailable) && !beneficiaries;
        const Icon = card.icon;
        const DeltaIcon =
          card.delta === null || card.delta === undefined ? Minus : card.delta >= 0 ? ArrowUpRight : ArrowDownRight;
        return (
          <div
            key={card.label}
            className="kpi-card"
            data-hue={index + 1}
            onClick={() => !dimmed && onSelect?.(card.label)}
            data-tip={
              dimmed
                ? `Add a "${card.unavailable}" column and re-upload to populate this card`
                : card.tip
            }
            style={dimmed ? { cursor: "default" } : undefined}
          >
            <span className="kpi-icon">
              <Icon width={15} height={15} />
            </span>
            <div className="kpi-label">{card.label}</div>
            <div className="kpi-value" style={dimmed ? { color: "var(--text-soft)" } : undefined}>
              {card.value}
            </div>
            <div className="kpi-sub">
              {card.delta !== undefined && card.delta !== null ? (
                <span className={`kpi-delta ${card.delta >= 0 ? "up" : "down"}`}>
                  <DeltaIcon width={11} height={11} />
                  {formatSignedPercent(card.delta)}
                </span>
              ) : null}
              <span className="truncate1">{card.sub}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
