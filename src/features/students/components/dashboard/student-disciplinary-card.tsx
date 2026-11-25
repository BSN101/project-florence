import Link from "next/link";
import { ChevronRight, ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudentDisciplinarySummary } from "@/features/discipline/contracts";

export function StudentDisciplinaryCard({
  summary,
  error,
  semesterId,
}: {
  summary: StudentDisciplinarySummary | null;
  error: string | null;
  semesterId?: string;
}) {
  const href = semesterId
    ? `/student/merits-demerits-and-services?semester=${encodeURIComponent(semesterId)}`
    : "/student/merits-demerits-and-services";

  return (
    <Card className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-6 transition-colors hover:border-primary/40 shadow-2xs">
      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-5" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-foreground truncate">
              Conduct & Discipline
            </h3>
          </div>
          {summary && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                summary.totalActiveDemerits === 0
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  summary.totalActiveDemerits === 0
                    ? "bg-emerald-600 dark:bg-emerald-400"
                    : "bg-amber-600 dark:bg-amber-400"
                }`}
              />
              {summary.totalActiveDemerits === 0 ? "Clean Record" : "Active Demerits"}
            </span>
          )}
        </div>

        {/* Metric content */}
        {error ? (
          <p className="text-xs text-destructive">
            Unable to load disciplinary records. Tap below to inspect.
          </p>
        ) : summary ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {summary.totalActiveDemerits}
              </span>
              <span className="text-xs text-muted-foreground">
                active demerit{summary.totalActiveDemerits === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                Office: {summary.office.balance} • RLE: {summary.rle.balance}
              </span>
              {summary.office.activeServiceCredits + summary.rle.activeServiceCredits > 0 ? (
                <span className="tabular-nums font-medium text-foreground">
                  {summary.office.activeServiceCredits + summary.rle.activeServiceCredits} hr(s) completed corrective service.
                </span>
              ) : (
                <span>No corrective service hours currently owed.</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No disciplinary ledger available for this semester.
          </p>
        )}
      </div>

      {/* Footer link */}
      <Link
        href={href}
        className="mt-4 flex min-h-[44px] items-center justify-between rounded-xl bg-muted/30 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
      >
        <span>View merits, demerits & service logs</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </Card>
  );
}
