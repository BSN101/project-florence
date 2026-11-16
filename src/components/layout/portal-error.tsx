"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Route error fallback. Production Server Component errors arrive with a generic message and a
 * digest only, so show neither raw details nor records; the digest matches the server log.
 */
export function PortalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  useEffect(() => console.error(error), [error]);

  return (
    <main role="alert" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16 max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <h1 className="page-title">This page could not load</h1>
      <p className="text-muted-foreground">Something went wrong while loading this page. Your records were not changed. Try again, or come back later if it keeps happening.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={retry}>Try again</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Back to home</Button>
      </div>
      {digest && <p className="text-xs text-muted-foreground">Reference: <span className="font-mono">{digest}</span></p>}
    </main>
  );
}
