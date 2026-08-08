import { Suspense } from "react";
import type { Metadata } from "next";

import { PageSkeleton } from "@/components/shared/page-skeleton";
import { TrendView } from "@/components/trend/trend-view";

export const metadata: Metadata = { title: "Trend Analysis · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TrendView />
    </Suspense>
  );
}
