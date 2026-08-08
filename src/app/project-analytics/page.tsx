import { Suspense } from "react";
import type { Metadata } from "next";

import { ProjectAnalyticsView } from "@/components/pages/project-analytics-view";
import { PageSkeleton } from "@/components/shared/page-skeleton";

export const metadata: Metadata = { title: "Project Analytics · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  // The views read filters from the URL via useSearchParams, which Next
  // requires to sit inside a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectAnalyticsView />
    </Suspense>
  );
}
