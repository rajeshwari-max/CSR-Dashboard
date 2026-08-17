"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  FolderKanban,
  IndianRupee,
  Minus,
  Plus,
  MapPinned,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

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
  spark: { label: string; value: number }[];
  unavailable?: string;
  icon: React.ElementType;
  tip?: string;
}

function Spark({ data, color }: { data: { value: number }[]; color: string }) {
  if (!data || data.length < 2) return null;
  const id = `sp-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
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
  const flat = kpis.spendSparkline.map((point) => ({ label: point.label, value: 0 }));

  const cards: KpiSpec[] = [
    {
      label: "Total CSR Spend",
      value: formatCrore(kpis.totalSpend),
      sub: `${kpis.latestYear ?? "—"}, all reporting`,
      delta: kpis.yoyGrowthPct,
      spark: kpis.spendSparkline,
      icon: IndianRupee,
    },
    {
      label: "Companies Reporting",
      value: formatNumber(kpis.companyCount),
      sub: `${kpis.sectorCount} sectors`,
      spark: kpis.companySparkline,
      icon: Building2,
    },
    {
      label: "Active Projects",
      value: formatNumber(kpis.projectCount),
      sub: `Across ${kpis.stateCount} states`,
      spark: kpis.projectSparkline,
      icon: FolderKanban,
    },
    beneficiaries
      ? {
          label: "Beneficiaries Reached",
          value: formatNumber(kpis.beneficiaries ?? 0),
          sub: "Across all reported projects",
          spark: kpis.beneficiarySparkline ?? flat,
          icon: Users,
        }
      : {
          // No beneficiary column in the dataset, so this slot shows geographic
          // depth instead of a dash. It switches back automatically the moment
          // a "Beneficiaries Reached" column is uploaded.
          label: "Districts Reached",
          value: formatNumber(kpis.districtCount),
          sub: `${kpis.stateCount} states and UTs`,
          spark: kpis.districtSparkline ?? flat,
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
      spark: kpis.complianceSparkline,
      icon: ShieldCheck,
      tip: "Share of companies in view that spent at least 95% of their disclosed CSR obligation in the latest year. Measured on each company's national total (an obligation is a whole-company figure), and filers that disclose no obligation are excluded from both sides.",
    },
    {
      label: "Avg. Spend / Company",
      value: formatCrore(kpis.avgSpendPerCompany),
      sub: `Median ${formatCrore(kpis.medianSpendPerCompany)}`,
      spark: kpis.avgSparkline,
      icon: Wallet,
    },
  ];

  // Sparkline colours track the card hue set in the stylesheet.
  const colors = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c5)", "var(--c4)", "var(--c7)"];

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
            <div className="kpi-spark chart-wrap">
              {dimmed ? (
                <Link href="/data-upload" className="kpi-cta">
                  <Plus width={11} height={11} />
                  Add {card.unavailable} column
                </Link>
              ) : (
                <Spark data={card.spark} color={colors[index]} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
