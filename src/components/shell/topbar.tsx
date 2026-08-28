"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, RefreshCw, Search } from "lucide-react";

import { BREADCRUMB } from "@/components/shell/nav";

interface TopbarProps {
  onMenu: () => void;
  onOpenPalette: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  datasetLabel?: string;
}

/** Topbar: menu, breadcrumbs, ⌘K trigger, notifications, avatar — as drafted. */
export function Topbar({ onMenu, onOpenPalette, onRefresh, isRefreshing, datasetLabel }: TopbarProps) {
  const pathname = usePathname();
  const [avatarOpen, setAvatarOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const current = BREADCRUMB[pathname] ?? BREADCRUMB[`/${pathname.split("/")[1]}`] ?? "Overview";

  return (
    <header className="topbar" ref={wrapRef}>
      <button type="button" className="icon-btn" onClick={onMenu} aria-label="Toggle navigation">
        <Menu className="icon" width={18} height={18} />
      </button>

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span className="sep">›</span>
        <span className="current">{current}</span>
      </nav>

      <button type="button" className="cmdk-trigger" onClick={onOpenPalette}>
        <Search className="icon" width={14} height={14} />
        <span>Search or jump to…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="topbar-actions">
        {onRefresh ? (
          <button
            type="button"
            className="icon-btn"
            onClick={onRefresh}
            aria-label="Refresh data"
            data-tip={datasetLabel ? `Dataset built ${datasetLabel}` : "Refresh"}
          >
            <RefreshCw className={`icon${isRefreshing ? " spin" : ""}`} width={17} height={17} />
          </button>
        ) : null}

        <div className="pos-rel">
          <button
            type="button"
            className="avatar-btn"
            onClick={() => {
              setAvatarOpen((open) => !open);
            }}
          >
            <span className="avatar">RC</span>
            <ChevronDown className="icon" width={14} height={14} />
          </button>
          <div className={`dropdown${avatarOpen ? " open" : ""}`} style={{ width: 220 }}>
            <div className="dropdown-head">Rajeshwari Chaubey</div>
            <Link href="/data-upload" className="menu-item">
              Upload new data
            </Link>
            <Link href="/reports" className="menu-item">
              Reports
            </Link>
            <Link href="/data-explorer" className="menu-item">
              Saved views
            </Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="menu-item" style={{ width: "100%", border: 0 }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
