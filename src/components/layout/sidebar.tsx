"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Database,
  FileBarChart,
  Handshake,
  Layers,
  LayoutGrid,
  MapPinned,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  group: string;
}

const NAV: NavItem[] = [
  { href: "/", label: "Executive Dashboard", icon: LayoutGrid, group: "Platform" },
  { href: "/company-analysis", label: "Company Analysis", icon: Building2, group: "Platform" },
  { href: "/state-analysis", label: "State Analysis", icon: MapPinned, group: "Platform" },
  { href: "/sector-analysis", label: "Sector Analysis", icon: Layers, group: "Platform" },
  { href: "/ngo-analysis", label: "NGO Analysis", icon: Handshake, group: "Platform" },
  { href: "/reports", label: "Reports", icon: FileBarChart, group: "Insights & Data" },
  { href: "/ai-insights", label: "AI Insights", icon: Sparkles, group: "Insights & Data" },
  { href: "/data-explorer", label: "Data Explorer", icon: Database, group: "Insights & Data" },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const groups = Array.from(new Set(NAV.map((item) => item.group)));

  return (
    <>
      {open ? (
        <div
          role="presentation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200",
          "lg:sticky lg:top-0 lg:h-svh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid size-9 place-items-center rounded-xl bg-sidebar-accent text-[15px] font-bold text-white">
            M
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">CMS</p>
            <p className="truncate text-[11px] uppercase tracking-wide text-sidebar-muted">CSR Intelligence</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto rounded-md p-1 text-sidebar-muted hover:bg-white/10 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group} className="mb-5">
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
                {group}
              </p>
              <div className="space-y-0.5">
                {NAV.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-sidebar-muted transition-colors",
                        "hover:bg-white/10 hover:text-sidebar-foreground",
                        active && "bg-white/10 text-sidebar-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4 text-[11px] leading-relaxed text-sidebar-muted">
          <p className="font-semibold text-sidebar-foreground">Project-level CSR disclosures</p>
          <p>India · updated via the ETL pipeline</p>
        </div>
      </aside>
    </>
  );
}
