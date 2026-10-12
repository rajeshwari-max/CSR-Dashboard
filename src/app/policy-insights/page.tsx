import { Suspense } from "react";
import type { Metadata } from "next";

import { PolicyInsightsView } from "@/components/pages/policy-insights-view";
import { PageSkeleton } from "@/components/shared/page-skeleton";

export const metadata: Metadata = { title: "Policy Insights · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PolicyInsightsView />
    </Suspense>
  );
}
