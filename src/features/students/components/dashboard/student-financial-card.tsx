import Link from "next/link";
import { ChevronRight, CircleDollarSign } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudentFinancialSummaryDTO } from "@/features/finance/contracts";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function StudentFinancialCard({
  summary,
  error,
  semesterId,
}: {
  summary: StudentFinancialSummaryDTO | null;
  error: string | null;
  semesterId?: string;
}) {
  const href = semesterId
    ? `/student/fees-and-fines?semester=${encodeURIComponent(semesterId)}`
    : "/student/fees-and-fines";

  return (
    <Card className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-6 transition-colors hover:border-primary/40 shadow-2xs">
      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CircleDollarSign className="size-5" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-foreground truncate">
              Financial Obligations
            </h3>
          </div>
          {summary && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                summary.totalOutstandingPayable === 0
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  summary.totalOutstandingPayable === 0
                    ? "bg-emerald-600 dark:bg-emerald-400"
                    : "bg-amber-600 dark:bg-amber-400"
                }`}
              />
              {summary.totalOutstandingPayable === 0 ? "All Dues Cleared" : "Outstanding"}
            </span>
          )}
        </div>

        {/* Metric content */}
        {error ? (
          <p className="text-xs text-destructive">
            Unable to load financial status. Tap below to inspect dues.
          </p>
        ) : summary ? (
          <div className="flex flex-col gap-1.5">
            <div className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {peso.format(summary.totalOutstandingPayable)}
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {summary.priorSemestersOverduePayable > 0 ? (
                <span className="tabular-nums">
                  Includes {peso.format(summary.priorSemestersOverduePayable)} overdue from prior terms.
                </span>
              ) : summary.totalOutstandingPayable > 0 ? (
                <span className="tabular-nums">
                  Current semester payable dues.
                </span>
              ) : (
                <span>No outstanding student dues or fines recorded.</span>
              )}
              {summary.totalPendingVerificationAmount > 0 && (
                <span className="text-amber-700 dark:text-amber-400 font-medium tabular-nums">
                  {peso.format(summary.totalPendingVerificationAmount)} transfer pending verification.
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No financial account data available for this semester.
          </p>
        )}
      </div>

      {/* Footer link */}
      <Link
        href={href}
        className="mt-4 flex min-h-[44px] items-center justify-between rounded-xl bg-muted/30 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
      >
        <span>View fees ledger & payment options</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </Card>
  );
}
