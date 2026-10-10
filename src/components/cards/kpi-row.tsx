"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarRange,
  FolderKanban,
  IndianRupee,
  Minus,
  MapPinned,
  Users,
} from "lucide-react";

import { formatCrore, formatNumber, formatSignedPercent } from "@/lib/format";
import type { Kpis, Meta } from "@/types";
import { MetricInfo } from "@/components/shared/metric-info";
import { useFilterStore } from "@/store/filters";

const shortYear = (year: string) => year.replace(/^FY\s*/, "FY");

/**
 * The years every KPI card covers: all reporting years in the dashboard by
 * default, or exactly the years picked in the Year filter.
 */
export function describeKpiPeriod(allYears: string[], selectedYears: string[]) {
  const all = [...allYears].sort((a, b) => a.localeCompare(b));
  const filtered = selectedYears.length > 0;
  const years = filtered ? all.filter((year) => selectedYears.includes(year)) : all;
  if (!years.length) return null;
  const first = all.indexOf(years[0]);
  const contiguous = years.every((year, index) => all.indexOf(year) === first + index);
  const range =
    years.length === 1
      ? years[0]
      : contiguous
        ? `${years[0]} – ${years[years.length - 1]}`
        : years.map(shortYear).join(", ");
  const tag = filtered
    ? `${years.length} of ${all.length} ${all.length === 1 ? "year" : "years"}`
    : years.length === 1
      ? "Only year"
      : `All ${years.length} years`;
  return { range, tag, filtered, count: years.length };
}

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
  const selectedYears = useFilterStore((state) => state.years);
  if (isLoading || !kpis) {
    return (
      <div className="kpi-row">
        {Array.from({ length: 4 }).map((_, index) => (
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
  const period = describeKpiPeriod(meta?.years ?? [], selectedYears);
  const periodTip = period
    ? period.filtered
      ? `Covers ${period.range} only, as picked in the Year filter. Clear the Year filter to see every year in the dashboard.`
      : `Covers every financial year in the dashboard (${period.range}). Pick years in the Year filter to narrow it.`
    : undefined;
  const cards: KpiSpec[] = [
    {
      label: "Total CSR Amount Spent for the Selected Period",
      value: formatCrore(kpis.totalSpend),
      sub:
        kpis.yoyGrowthPct !== null && kpis.previousYear
          ? `${kpis.latestYear} vs ${kpis.previousYear}`
          : period && period.count > 1
            ? "Cumulative across the years shown"
            : `${kpis.latestYear ?? "—"}`,
      delta: kpis.yoyGrowthPct,
      icon: IndianRupee,
      tip: "Cumulative CSR amount spent across all projects and financial years in the current filter selection.",
    },
    {
      label: "Companies Reporting in the Selected Period",
      value: formatNumber(kpis.companyCount),
      sub: `${kpis.sectorCount} sectors`,
      icon: Building2,
      tip: "Distinct companies with at least one CSR project reported in the current selection.",
    },
    {
      label: "CSR Projects Reported in the Selected Period",
      value: formatNumber(kpis.projectCount),
      sub: "Across India",
      icon: FolderKanban,
      tip: "Total project records reported by the selected companies, years and locations.",
    },
    beneficiaries
      ? {
          label: "Beneficiaries Reached by Reported CSR Projects",
          value: formatNumber(kpis.beneficiaries ?? 0),
          sub: "Across all reported projects",
          icon: Users,
          tip: "Total beneficiaries disclosed for projects in the current selection.",
        }
      : {
          // No beneficiary column in the dataset, so this slot shows geographic
          // depth instead of a dash. It switches back automatically the moment
          // a "Beneficiaries Reached" column is uploaded.
          label: "Districts Reached by Reported CSR Projects",
          value: formatNumber(kpis.districtCount),
          sub: "States and UTs across India",
          icon: MapPinned,
          tip: "Distinct districts reached by projects that include a recorded district location.",
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
            <div className="kpi-label metric-title"><span>{card.label}</span><MetricInfo title={card.label} /></div>
            {period ? (
              <div className="kpi-period" title={periodTip}>
                <CalendarRange width={12} height={12} aria-hidden="true" />
                <span className="kpi-period-range">{period.range}</span>
                <span className={`kpi-period-tag${period.filtered ? " filtered" : ""}`}>{period.tag}</span>
              </div>
            ) : null}
            <div
              className="kpi-value"
              title={card.value}
              style={dimmed ? { color: "var(--text-soft)" } : undefined}
            >
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
