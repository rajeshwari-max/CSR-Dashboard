import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="max-w-md p-8 text-center">
        <p className="numeric text-3xl font-semibold">404</p>
        <h2 className="mt-2 text-lg font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist in the CSR dashboard.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </Card>
    </main>
  );
}
