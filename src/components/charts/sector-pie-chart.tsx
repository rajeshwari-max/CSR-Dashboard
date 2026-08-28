"use client";

import * as React from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { formatCrore, formatShare } from "@/lib/format";
import type { NamedValue } from "@/types";

interface SectorPieChartProps {
  data: NamedValue[];
  /** Everything beyond `sliceCount` is rolled into an "Other sectors" slice. */
  sliceCount?: number;
  onSelect?: (name: string) => void;
}

export function SectorPieChart({ data, sliceCount = 8, onSelect }: SectorPieChartProps) {
  const slices = React.useMemo(() => {
    const head = data.slice(0, sliceCount);
    const tail = data.slice(sliceCount);
    if (!tail.length) return head;
    const rest = tail.reduce((sum, item) => sum + item.value, 0);
    return [...head, { name: `Other (${tail.length} sectors)`, value: Math.round(rest * 100) / 100 }];
  }, [data, sliceCount]);

  const total = slices.reduce((sum, item) => sum + item.value, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius="52%"
          outerRadius="80%"
          paddingAngle={1.5}
          stroke="var(--surface)"
          strokeWidth={2}
          onClick={(entry: { name?: string }) => {
            if (entry?.name && onSelect && !entry.name.startsWith("Other")) onSelect(entry.name);
          }}
          cursor={onSelect ? "pointer" : "default"}
        >
          {slices.map((slice, index) => (
            <Cell key={slice.name} fill={colorAt(index)} />
          ))}
        </Pie>
        <Tooltip
          {...TOOLTIP_STYLES}
          formatter={(value: number, name: string) => [
            `${formatCrore(value)} · ${formatShare(total ? value / total : 0)}`,
            name,
          ]}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => (
            <span className="text-xs text-muted-foreground">
              {value.length > 24 ? `${value.slice(0, 23)}…` : value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
