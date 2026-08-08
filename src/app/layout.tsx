import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "CMS · CSR Intelligence Platform",
  description:
    "Executive dashboard over project-level Corporate Social Responsibility spend disclosures by Indian companies.",
  applicationName: "CMS CSR Intelligence",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Loaded via <link> rather than next/font so the app also builds on
          machines with no outbound network; the stacks in the draft stylesheet
          fall back to system fonts.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap"
        />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
