import { ShieldAlert } from "lucide-react";

import type { StudentDisciplinarySummary } from "@/features/discipline/contracts";
import { getDisciplinaryStatus } from "@/features/students/dashboard";
import {
  buildSemesterHref,
  DashboardSummaryCard,
} from "./dashboard-summary-card";

export function StudentDisciplinaryCard({
  summary,
  error,
  semesterId,
}: {
  summary: StudentDisciplinarySummary | null;
  error: string | null;
  semesterId?: string;
}) {
  const href = buildSemesterHref("/student/merits-demerits-and-services", semesterId);
  const status = summary ? getDisciplinaryStatus(summary) : null;
  const isClean = status === "Clean Record";

  const badge = summary ? (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isClean
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          isClean
            ? "bg-emerald-600 dark:bg-emerald-400"
            : "bg-amber-600 dark:bg-amber-400"
        }`}
      />
      {status}
    </span>
  ) : undefined;

  return (
    <DashboardSummaryCard
      title="Conduct & Discipline"
      icon={<ShieldAlert className="size-5" />}
      iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
      badge={badge}
      href={href}
      footerLabel="View merits, demerits & service logs"
      error={error ? "Unable to load disciplinary records. Tap below to inspect." : null}
      empty={!summary}
      emptyMessage="No disciplinary ledger available for this semester."
    >
      {summary && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {summary.totalActiveBalance}
            </span>
            <span className="text-xs text-muted-foreground">
              active demerit day{summary.totalActiveBalance === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              Office: {summary.office.balance} day{summary.office.balance === 1 ? "" : "s"} • RLE: {summary.rle.balance} day{summary.rle.balance === 1 ? "" : "s"}
            </span>
            {summary.office.activeServiceCredits + summary.rle.activeServiceCredits > 0 ? (
              <span className="tabular-nums font-medium text-foreground">
                {summary.office.activeServiceCredits + summary.rle.activeServiceCredits} completed duty service credit{summary.office.activeServiceCredits + summary.rle.activeServiceCredits === 1 ? "" : "s"}.
              </span>
            ) : (
              <span>No corrective service credits recorded.</span>
            )}
          </div>
        </div>
      )}
    </DashboardSummaryCard>
  );
}
