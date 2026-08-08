"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_PROPS, colorAt, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { formatCompact, formatCrore, formatShare } from "@/lib/format";
import { truncate } from "@/lib/format";
import type { NamedValue } from "@/types";

export function CompanyBarChart({ data }: { data: NamedValue[] }) {
  const router = useRouter();
  const rows = [...data].reverse(); // largest at the top of a horizontal chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} tickFormatter={(value: number) => formatCompact(value)} />
        <YAxis
          type="category"
          dataKey="name"
          width={168}
          {...AXIS_PROPS}
          tickFormatter={(value: string) => truncate(value, 24)}
        />
        <Tooltip
          {...TOOLTIP_STYLES}
          formatter={(value: number, _name: string, item: { payload?: NamedValue }) => [
            `${formatCrore(value)} · ${formatShare(item?.payload?.share)} of view`,
            "CSR spend",
          ]}
        />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          maxBarSize={22}
          cursor="pointer"
          onClick={(entry: { payload?: NamedValue }) => {
            const id = entry?.payload?.id;
            if (id) router.push(`/companies/${encodeURIComponent(id)}`);
          }}
        >
          {rows.map((row, index) => (
            <Cell key={row.id ?? row.name} fill={colorAt(rows.length - 1 - index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
