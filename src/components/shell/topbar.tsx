"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Compass, Menu, RefreshCw } from "lucide-react";

import { BREADCRUMB } from "@/components/shell/nav";
import { useTour } from "@/components/tour/guided-tour";

interface TopbarProps {
  onMenu: () => void;
  onOpenPalette: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  datasetLabel?: string;
}

/** Topbar: menu, breadcrumbs, refresh and account controls. */
export function Topbar({ onMenu, onRefresh, isRefreshing, datasetLabel }: TopbarProps) {
  const pathname = usePathname();
  const [avatarOpen, setAvatarOpen] = React.useState(false);
  const { openTour } = useTour();
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

      <div className="topbar-actions">
        <button type="button" className="tour-launch" data-tour="tour-button" onClick={openTour} data-tip="Guided tour: a step-by-step walkthrough that shows you how to use the filters and each page">
          <Compass width={15} height={15} />
          Tour
        </button>
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
              CSR Data
            </Link>
            {process.env.NEXT_PUBLIC_AUTH_ENABLED === "true" ? <form action="/api/auth/logout" method="post">
              <button type="submit" className="menu-item" style={{ width: "100%", border: 0 }}>Sign out</button>
            </form> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
