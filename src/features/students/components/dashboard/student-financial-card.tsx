import { CircleDollarSign } from "lucide-react";

import { formatPhp } from "@/features/finance/calculations";
import type { StudentFinancialSummaryDTO } from "@/features/finance/contracts";
import {
  buildSemesterHref,
  DashboardSummaryCard,
} from "./dashboard-summary-card";

export function StudentFinancialCard({
  summary,
  error,
  semesterId,
}: {
  summary: StudentFinancialSummaryDTO | null;
  error: string | null;
  semesterId?: string;
}) {
  const href = buildSemesterHref("/student/fees-and-fines", semesterId);

  const badge = summary ? (
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
  ) : undefined;

  return (
    <DashboardSummaryCard
      title="Financial Obligations"
      icon={<CircleDollarSign className="size-5" />}
      iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      badge={badge}
      href={href}
      footerLabel="View fees ledger & payment options"
      error={error ? "Unable to load financial status. Tap below to inspect dues." : null}
      empty={!summary}
      emptyMessage="No financial account data available for this semester."
    >
      {summary && (
        <div className="flex flex-col gap-1.5">
          <div className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatPhp(summary.totalOutstandingPayable)}
          </div>
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {summary.priorSemestersOverduePayable > 0 ? (
              <span className="tabular-nums">
                Includes {formatPhp(summary.priorSemestersOverduePayable)} overdue from prior terms.
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
                {formatPhp(summary.totalPendingVerificationAmount)} transfer pending verification.
              </span>
            )}
          </div>
        </div>
      )}
    </DashboardSummaryCard>
  );
}
