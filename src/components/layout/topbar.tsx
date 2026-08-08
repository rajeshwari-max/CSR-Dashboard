"use client";

import * as React from "react";
import { Menu, RefreshCw } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onMenu: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, onMenu, onRefresh, isRefreshing, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        {onRefresh ? (
          <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh data">
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
          </Button>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
