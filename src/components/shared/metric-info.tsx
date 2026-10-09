"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { dashboardMetadata, type DashboardMetricMeta } from "@/lib/dashboard-metadata";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 336;
const GAP = 8;
const MARGIN = 12;

export function MetricInfo({ title, meta, className }: { title: string; meta?: DashboardMetricMeta; className?: string }) {
  const details = meta ?? dashboardMetadata[title];
  // Hover previews the definition; a click (or tap) pins it open until focus
  // leaves or Escape is pressed.
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const open = hovered || pinned;

  // The popover is rendered into <body> with fixed positioning so that cards
  // with overflow:hidden (the KPI cards) cannot clip it.
  const place = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - MARGIN * 2);
    const left = Math.min(Math.max(MARGIN, rect.left - 12), window.innerWidth - width - MARGIN);
    setPosition({ top: rect.bottom + GAP, left, width });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Only metrics and charts with a documented definition get an info button;
  // utility panels (saved views, downloads, empty states) stay plain.
  if (!details) return null;

  const close = () => { setPinned(false); setHovered(false); };
  const popover = open && position && typeof document !== "undefined"
    ? createPortal(
        <span className="metric-info-popover" role="tooltip" style={{ top: position.top, left: position.left, width: position.width }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <strong>{title}</strong>
          <span>{details.description}</span>
          {details.calculation ? <span><b>Calculation:</b> {details.calculation}</span> : null}
          {details.unit ? <span><b>Unit:</b> {details.unit}</span> : null}
          {details.source ? <span><b>Source:</b> {details.source}</span> : null}
        </span>,
        document.body,
      )
    : null;

  return <span className={cn("metric-info", className)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
    <button ref={triggerRef} type="button" className="metric-info-trigger" aria-label={`About ${title}`} aria-expanded={open} onBlur={close} onClick={() => setPinned((value) => !value)}><Info aria-hidden="true" /></button>
    {popover}
  </span>;
}

export function ExplainedTitle({ title, as: Tag = "h3", className }: { title: string; as?: "h2" | "h3" | "h4"; className?: string }) {
  return <Tag className={cn("metric-title", className)}><span>{title}</span><MetricInfo title={title} /></Tag>;
}
