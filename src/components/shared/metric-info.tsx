"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { dashboardMetadata, type DashboardMetricMeta } from "@/lib/dashboard-metadata";
import { cn } from "@/lib/utils";

export function MetricInfo({ title, meta, className }: { title: string; meta?: DashboardMetricMeta; className?: string }) {
  const details = meta ?? dashboardMetadata[title];
  // Hover previews the definition; a click (or tap) pins it open until focus
  // leaves or Escape is pressed. A single toggle state made the click close the
  // popover that the hover/focus had just opened, so taps showed nothing.
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const open = hovered || pinned;
  // Only metrics and charts with a documented definition get an info button;
  // utility panels (saved views, downloads, empty states) stay plain.
  if (!details) return null;
  return <span className={cn("metric-info", className)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setHovered(false); } }}>
    <button type="button" className="metric-info-trigger" aria-label={`About ${title}`} aria-expanded={open} onBlur={() => { setPinned(false); setHovered(false); }} onClick={() => setPinned((value) => !value)}><Info aria-hidden="true" /></button>
    {open ? <span className="metric-info-popover" role="tooltip"><strong>{title}</strong><span>{details.description}</span>{details.calculation ? <span><b>Calculation:</b> {details.calculation}</span> : null}{details.unit ? <span><b>Unit:</b> {details.unit}</span> : null}{details.source ? <span><b>Source:</b> {details.source}</span> : null}</span> : null}
  </span>;
}

export function ExplainedTitle({ title, as: Tag = "h3", className }: { title: string; as?: "h2" | "h3" | "h4"; className?: string }) {
  return <Tag className={cn("metric-title", className)}><span>{title}</span><MetricInfo title={title} /></Tag>;
}
