import { Suspense } from "react";
import type { Metadata } from "next";

import { PageSkeleton } from "@/components/shared/page-skeleton";
import { UploadView } from "@/components/upload/upload-view";

export const metadata: Metadata = { title: "Data Upload · CMS CSR Intelligence" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UploadView />
    </Suspense>
  );
}
