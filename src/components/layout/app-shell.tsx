"use client";

import * as React from "react";

import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex min-h-svh w-full">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SidebarContext.Provider value={{ openSidebar: () => setOpen(true) }}>{children}</SidebarContext.Provider>
      </div>
    </div>
  );
}

export const SidebarContext = React.createContext<{ openSidebar: () => void }>({ openSidebar: () => {} });

export function useSidebar() {
  return React.useContext(SidebarContext);
}
