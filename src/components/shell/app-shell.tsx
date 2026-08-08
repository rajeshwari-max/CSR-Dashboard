"use client";

import * as React from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";

interface ShellContextValue {
  openMobileNav: () => void;
  openPalette: () => void;
  toast: (message: string) => void;
}

const ShellContext = React.createContext<ShellContextValue>({
  openMobileNav: () => {},
  openPalette: () => {},
  toast: () => {},
});

export function useShell() {
  return React.useContext(ShellContext);
}

const COLLAPSE_KEY = "cms.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage blocked */
      }
      return next;
    });

  // ⌘K / Ctrl+K opens the palette anywhere in the app.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toast = React.useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2600);
  }, []);

  const value = React.useMemo<ShellContextValue>(
    () => ({
      openMobileNav: () => setMobileOpen((open) => !open),
      openPalette: () => setPaletteOpen(true),
      toast,
    }),
    [toast],
  );

  return (
    <ShellContext.Provider value={value}>
      <div className="app-shell">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <div className={`toast${toastMessage ? " show" : ""}`}>{toastMessage}</div>
    </ShellContext.Provider>
  );
}
