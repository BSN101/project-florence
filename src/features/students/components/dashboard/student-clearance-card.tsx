import Link from "next/link";
import { Check, ChevronRight, ClipboardCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudentClearanceSummary } from "@/features/clearance/contracts";

export function StudentClearanceCard({
  summary,
  error,
  semesterId,
}: {
  summary: StudentClearanceSummary | null;
  error: string | null;
  semesterId?: string;
}) {
  const href = semesterId
    ? `/student/clearance?semester=${encodeURIComponent(semesterId)}`
    : "/student/clearance";

  const clearedCount = summary
    ? (summary.components.council.cleared ? 1 : 0) +
      (summary.components.academic.cleared ? 1 : 0) +
      (summary.components.rle.cleared ? 1 : 0)
    : 0;

  return (
    <Card className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-6 transition-colors hover:border-primary/40 shadow-2xs">
      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ClipboardCheck className="size-5" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-foreground truncate">
              Clearance Status
            </h3>
          </div>
          {summary && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                summary.isFullyCleared
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  summary.isFullyCleared
                    ? "bg-emerald-600 dark:bg-emerald-400"
                    : "bg-amber-600 dark:bg-amber-400"
                }`}
              />
              {summary.isFullyCleared ? "Complete" : `${clearedCount} of 3 Confirmed`}
            </span>
          )}
        </div>

        {/* Metric content */}
        {error ? (
          <p className="text-xs text-destructive">
            Unable to load clearance status. Tap below to inspect.
          </p>
        ) : summary ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {clearedCount} / 3
              </span>
              <span className="text-xs text-muted-foreground">
                tier clearances confirmed
              </span>
            </div>

            {/* Component Chips Row */}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "council", label: "Council", ...summary.components.council },
                  { key: "academic", label: "Academic", ...summary.components.academic },
                  { key: "rle", label: "RLE", ...summary.components.rle },
                ] as const
              ).map((tier) => (
                <div
                  key={tier.key}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center text-xs transition-colors min-w-0 ${
                    tier.cleared
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                      : "border-border bg-muted/20 text-muted-foreground"
                  }`}
                >
                  <span className="font-medium truncate max-w-full">{tier.label}</span>
                  <div className="flex items-center gap-1 text-[11px] shrink-0">
                    {tier.cleared ? (
                      <>
                        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          Cleared
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        <span>Pending</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No clearance records available for this semester.
          </p>
        )}
      </div>

      {/* Footer link */}
      <Link
        href={href}
        className="mt-4 flex min-h-[44px] items-center justify-between rounded-xl bg-muted/30 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
      >
        <span>Check sign-off details & history</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </Card>
  );
}
