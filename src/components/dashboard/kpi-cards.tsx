"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Building2, IndianRupee, Minus, TrendingUp, Wallet } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCrore, formatNumber, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Kpis } from "@/types";

interface KpiDefinition {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  delta?: number | null;
  spark: { label: string; value: number }[];
  color: string;
}

export function KpiCards({ kpis, isLoading }: { kpis: Kpis | null; isLoading: boolean }) {
  if (isLoading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-4 h-10 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  const cards: KpiDefinition[] = [
    {
      key: "spend",
      label: "Total CSR Spend",
      value: formatCrore(kpis.totalSpend),
      sub: `${formatNumber(kpis.projectCount)} projects · across India`,
      icon: IndianRupee,
      delta: kpis.yoyGrowthPct,
      spark: kpis.spendSparkline,
      color: "hsl(var(--chart-1))",
    },
    {
      key: "companies",
      label: "Companies Reporting",
      value: formatNumber(kpis.companyCount),
      sub: `${kpis.sectorCount} sectors represented`,
      icon: Building2,
      spark: kpis.companySparkline,
      color: "hsl(var(--chart-2))",
    },
    {
      key: "average",
      label: "Avg Spend / Company",
      value: formatCrore(kpis.avgSpendPerCompany),
      sub: `Median ${formatCrore(kpis.medianSpendPerCompany)}`,
      icon: Wallet,
      spark: kpis.avgSparkline,
      color: "hsl(var(--chart-4))",
    },
    {
      key: "growth",
      label: "Year-on-Year Growth",
      value: formatSignedPercent(kpis.yoyGrowthPct),
      sub:
        kpis.latestYear && kpis.previousYear
          ? `${kpis.previousYear} → ${kpis.latestYear}`
          : "Needs two years of data",
      icon: TrendingUp,
      delta: kpis.yoyGrowthPct,
      spark: kpis.spendSparkline,
      color: "hsl(var(--chart-3))",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const DeltaIcon =
          card.delta === null || card.delta === undefined
            ? Minus
            : card.delta >= 0
              ? ArrowUpRight
              : ArrowDownRight;
        return (
          <Card key={card.key} className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-pop">
            <div className="flex items-start justify-between gap-2">
              <span className="kpi-label">{card.label}</span>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
            </div>

            <div className="flex items-end justify-between gap-2">
              <span className="kpi-value">{card.value}</span>
              {card.delta !== undefined ? (
                <span
                  className={cn(
                    "numeric inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                    card.delta === null
                      ? "bg-muted text-muted-foreground"
                      : card.delta >= 0
                        ? "bg-success/12 text-success"
                        : "bg-destructive/12 text-destructive",
                  )}
                >
                  <DeltaIcon className="size-3" />
                  {formatSignedPercent(card.delta)}
                </span>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">{card.sub}</p>
            <div className="h-10">
              <Sparkline data={card.spark} color={card.color} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
