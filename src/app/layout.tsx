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
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
