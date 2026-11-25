import { Check, ClipboardCheck } from "lucide-react";

import type { StudentClearanceSummary } from "@/features/clearance/contracts";
import {
  buildSemesterHref,
  DashboardSummaryCard,
} from "./dashboard-summary-card";

export function StudentClearanceCard({
  summary,
  error,
  semesterId,
}: {
  summary: StudentClearanceSummary | null;
  error: string | null;
  semesterId?: string;
}) {
  const href = buildSemesterHref("/student/clearance", semesterId);

  const clearedCount = summary
    ? (summary.components.council.cleared ? 1 : 0) +
      (summary.components.academic.cleared ? 1 : 0) +
      (summary.components.rle.cleared ? 1 : 0)
    : 0;

  const badge = summary ? (
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
  ) : undefined;

  return (
    <DashboardSummaryCard
      title="Clearance Status"
      icon={<ClipboardCheck className="size-5" />}
      iconClassName="bg-purple-500/10 text-purple-600 dark:text-purple-400"
      badge={badge}
      href={href}
      footerLabel="Check sign-off details & history"
      error={error ? "Unable to load clearance status. Tap below to inspect." : null}
      empty={!summary}
      emptyMessage="No clearance records available for this semester."
    >
      {summary && (
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
      )}
    </DashboardSummaryCard>
  );
}
