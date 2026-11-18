import { Suspense } from "react";
import type { Metadata } from "next";

import { AspirationalDistrictsView } from "@/components/pages/aspirational-districts-view";
import { PageSkeleton } from "@/components/shared/page-skeleton";

export const metadata: Metadata = { title: "Aspirational Districts · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  // The views read filters from the URL via useSearchParams, which Next
  // requires to sit inside a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AspirationalDistrictsView />
    </Suspense>
  );
}
