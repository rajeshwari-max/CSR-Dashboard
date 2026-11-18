"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarRange,
  FolderKanban,
  IndianRupee,
  Minus,
  MapPinned,
  Target,
  Users,
} from "lucide-react";

import { formatCrore, formatNumber, formatShare, formatSignedPercent } from "@/lib/format";
import type { Kpis, Meta } from "@/types";
import { MetricInfo } from "@/components/shared/metric-info";
import { useFilterStore } from "@/store/filters";

const shortYear = (year: string) => year.replace(/^FY\s*/, "FY");

/**
 * The years every KPI card covers: all reporting years in the dashboard by
 * default, or exactly the years picked in the Year filter.
 */
export function describeKpiPeriod(reportingYears: string[], selectedYears: string[], earlierYears: string[] = []) {
  const all = [...earlierYears, ...reportingYears].sort((a, b) => a.localeCompare(b));
  const filtered = selectedYears.length > 0;
  const years = filtered ? all.filter((year) => selectedYears.includes(year)) : [...reportingYears].sort((a, b) => a.localeCompare(b));
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
    ? `${years.length} ${years.length === 1 ? "year" : "years"} selected`
    : years.length === 1
      ? "Only year"
      : earlierYears.length
        ? `${years.length} years`
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

export interface KpiSpec {
  label: string;
  value: string;
  sub: React.ReactNode;
  delta?: number | null;
  unavailable?: string;
  icon: React.ElementType;
  tip?: string;
  /** Page the card opens when clicked. */
  href?: string;
}

export function KpiRow({
  kpis,
  meta,
  isLoading,
  onSelect,
  extra,
}: {
  /** Extra card appended to the row (e.g. reported unspent CSR from annexures). */
  extra?: KpiSpec | null;
  kpis: Kpis | null;
  meta: Meta | null;
  isLoading: boolean;
  onSelect?: (key: string) => void;
}) {
  const selectedYears = useFilterStore((state) => state.years);
  const router = useRouter();
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
  const period = describeKpiPeriod(meta?.years ?? [], selectedYears, meta?.earlierYears ?? []);
  const periodTip = period
    ? period.filtered
      ? `Covers ${period.range} only, as picked in the Year filter. Clear the Year filter to see every year in the dashboard.`
      : `Covers every financial year in the default view (${period.range}). Pick years in the Year filter to narrow it${meta?.earlierYears?.length ? `, or to add earlier years (${meta.earlierYears[0]} onwards)` : ""}.`
    : undefined;
  const cards: KpiSpec[] = [
    {
      label: "Total CSR Expenditure",
      value: formatCrore(kpis.totalSpend),
      sub:
        kpis.yoyGrowthPct !== null && kpis.previousYear
          ? "compared to previous year"
          : period && period.count > 1
            ? "Cumulative across the years shown"
            : `${kpis.latestYear ?? "—"}`,
      delta: kpis.yoyGrowthPct,
      icon: IndianRupee,
      href: "/trend-analysis",
      tip: "Total CSR expenditure reported by companies during the selected financial years. Click for year-wise expenditure, top contributing companies and sectoral distribution.",
    },
    {
      label: "Companies with Reported CSR Data",
      value: formatNumber(kpis.companyCount),
      sub: `${kpis.sectorCount} sectors`,
      icon: Building2,
      href: "/company-analysis",
      tip: "Number of companies represented in the selected period. Click for the company-wise list, ownership and sector distribution.",
    },
    {
      label: "Reported CSR Projects",
      value: formatNumber(kpis.projectCount),
      sub: "Across India",
      icon: FolderKanban,
      href: "/data-explorer",
      tip: "Total number of CSR projects recorded in the selected period. Click for project details, implementing agencies and locations.",
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
          label: "Districts with Reported CSR Projects",
          value: formatNumber(kpis.districtCount),
          sub: "With a recorded district location",
          icon: MapPinned,
          href: "/explore-data?unit=district",
          tip: "Number of districts with a recorded geographical location for CSR projects. Click for the district-wise CSR view.",
        },
    {
      label: "Aspirational District Coverage",
      value: `${formatNumber(kpis.aspirationalDistrictCount ?? 0)} of 112`,
      sub: `${formatCrore(kpis.aspirationalSpend)} spent · ${formatShare(kpis.aspirationalShare)} of total`,
      icon: Target,
      href: "/aspirational-districts",
      tip: "Number of aspirational districts with reported CSR project coverage. Click for districts covered, expenditure and companies investing in these districts.",
    },
  ];
  // Primary order (3 × 2): Companies, Total CSR, Projects / Districts, Unspent, Aspirational.
  const [total, companies, projects, districts, aspirational] = cards;
  cards.splice(0, cards.length, companies, total, projects, districts, ...(extra ? [extra] : []), aspirational);

  return (
    <div className={`kpi-row${cards.length === 5 ? " five" : cards.length === 6 ? " six" : ""}`}>
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
            onClick={() => {
              if (dimmed) return;
              if (card.href) {
                const [path, hash] = card.href.split("#");
                const query = window.location.search;
                const join = path.includes("?") ? (query ? `&${query.slice(1)}` : "") : query;
                router.push(`${path}${join}${hash ? `#${hash}` : ""}`);
              } else onSelect?.(card.label);
            }}
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
