import { Suspense } from "react";

import { ExecutiveDashboard } from "@/components/pages/executive-dashboard";
import { PageSkeleton } from "@/components/shared/page-skeleton";

export const dynamic = "force-dynamic";

export default function Page() {
  // useSearchParams inside the view requires a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExecutiveDashboard />
    </Suspense>
  );
}
