"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { ICONS } from "@/components/shell/icons";
import { NAV } from "@/components/shell/nav";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * Persistent collapsible sidebar, matching the draft: white surface, grouped
 * nav, gradient rail on the active item, keyboard hints, footer utilities.
 */
export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const groups = ["Platform", "Insights & Data"] as const;

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
      <div className="sidebar-top">
        <span className="brand-mark">CMS</span>
        <div className="brand-name">
          CMS
          <small>CSR Intelligence</small>
        </div>
      </div>

      <div className="sidebar-scroll">
        {groups.map((group) => (
          <div key={group}>
            <div className="nav-group-title">{group}</div>
            {NAV.filter((entry) => entry.group === group).map((entry) => {
              const Icon = ICONS[entry.icon];
              const active = entry.href === "/" ? pathname === "/" : pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={onCloseMobile}
                  className={`nav-item${active ? " active" : ""}`}
                  title={collapsed ? entry.label : undefined}
                >
                  <Icon className="icon" width={17} height={17} />
                  <span className="nav-label">{entry.label}</span>
                  {entry.kbd ? <span className="kbd">{entry.kbd}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="nav-item" onClick={onToggleCollapsed}>
          <ChevronsLeft
            className="icon"
            width={17}
            height={17}
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          />
          <span className="nav-label">{collapsed ? "Expand" : "Collapse"}</span>
        </button>
        <button type="button" className="nav-item" onClick={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun className="icon" width={17} height={17} /> : <Moon className="icon" width={17} height={17} />}
          <span className="nav-label">{isDark ? "Light mode" : "Dark mode"}</span>
        </button>
      </div>
    </aside>
  );
}
