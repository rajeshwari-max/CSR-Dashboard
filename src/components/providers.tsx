"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";

/** The draft themes via `data-theme`, so next-themes is pointed at that attribute. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
