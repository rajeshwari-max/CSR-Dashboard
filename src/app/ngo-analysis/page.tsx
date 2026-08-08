import { Suspense } from "react";
import type { Metadata } from "next";

import { NgoAnalysisView } from "@/components/pages/ngo-analysis-view";
import { PageSkeleton } from "@/components/shared/page-skeleton";

export const metadata: Metadata = { title: "NGO Analysis · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  // The views read filters from the URL via useSearchParams, which Next
  // requires to sit inside a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NgoAnalysisView />
    </Suspense>
  );
}
