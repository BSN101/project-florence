"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

/**
 * For screens showing changes other people make (payments, attendance, clearance). Revisits within
 * the client cache window (`staleTimes.dynamic`) reuse the last render, so show when it was made and
 * let the user fetch fresh data.
 */
export function RefreshButton({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const updated = time.format(new Date(renderedAt));
  return (
    <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5 text-xs" disabled={refreshing}
      onClick={() => startRefresh(() => router.refresh())} title={`Last updated ${updated}`} aria-label={`Refresh (last updated ${updated})`}>
      <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">Updated {updated}</span>
    </Button>
  );
}
