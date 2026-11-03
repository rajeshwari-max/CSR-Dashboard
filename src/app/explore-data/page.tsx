import { Suspense } from "react";
import type { Metadata } from "next";

import { ExploreDataView } from "@/components/pages/explore-data-view";
import { PageSkeleton } from "@/components/shared/page-skeleton";

export const metadata: Metadata = { title: "Indicator Explorer · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  // The views read filters from the URL via useSearchParams, which Next
  // requires to sit inside a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExploreDataView />
    </Suspense>
  );
}
