"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, HelpCircle, Moon, Settings, Sun } from "lucide-react";
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
            {NAV.filter((entry) => entry.group === group).map((entry, position) => {
              const Icon = ICONS[entry.icon];
              // Hue index cycles 1-8, matching the ramp in the stylesheet.
              const hue = ((NAV.findIndex((item) => item.href === entry.href) + position) % 8) + 1;
              const active = entry.href === "/" ? pathname === "/" : pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={onCloseMobile}
                  className={`nav-item${active ? " active" : ""}`}
                  data-hue={hue}
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
        <Link href="/data-upload" className="nav-item" onClick={onCloseMobile}>
          <Settings className="icon" width={17} height={17} />
          <span className="nav-label">Settings</span>
        </Link>
        <a
          className="nav-item"
          href="https://www.mca.gov.in/content/mca/global/en/home.html"
          target="_blank"
          rel="noreferrer noopener"
        >
          <HelpCircle className="icon" width={17} height={17} />
          <span className="nav-label">Help</span>
        </a>
      </div>
    </aside>
  );
}
