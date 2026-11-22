import Link from "next/link";
import { AlertTriangle, Award, CheckCircle2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { StudentDisciplinarySummary } from "../contracts";
import { BucketBadge } from "./disciplinary-badges";

const formatDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function DisciplinaryBalanceCards({
  summary,
  applyOfficeHref,
  applyRleHref,
}: {
  summary: StudentDisciplinarySummary;
  applyOfficeHref?: string;
  applyRleHref?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
      {/* Office Bucket */}
      <Card className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-2 pb-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Office Duty
            </span>
            <BucketBadge bucket="office" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {summary.office.balance > 0 ? formatDays(summary.office.balance) : "0 days"}
            </div>
            {summary.office.balance === 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="size-3.5" />
                Clear
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive shrink-0">
                <AlertTriangle className="size-3.5" />
                Sanction
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {summary.office.activeDemerits} demerits · {summary.office.appliedMerits} applied merits ·{" "}
            {summary.office.activeServiceCredits} duty credits
          </p>
        </div>
        {applyOfficeHref ? (
          <div className="mt-3 pt-2.5 border-t border-border/50">
            <Link
              href={applyOfficeHref}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline max-sm:min-h-11"
            >
              Apply merits →
            </Link>
          </div>
        ) : null}
      </Card>

      {/* RLE Bucket */}
      <Card className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-2 pb-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Clinical (RLE) Duty
            </span>
            <BucketBadge bucket="rle" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {summary.rle.balance > 0 ? formatDays(summary.rle.balance) : "0 days"}
            </div>
            {summary.rle.balance === 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="size-3.5" />
                Clear
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive shrink-0">
                <AlertTriangle className="size-3.5" />
                Sanction
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {summary.rle.activeDemerits} demerits · {summary.rle.appliedMerits} applied merits ·{" "}
            {summary.rle.activeServiceCredits} duty credits
          </p>
        </div>
        {applyRleHref ? (
          <div className="mt-3 pt-2.5 border-t border-border/50">
            <Link
              href={applyRleHref}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline max-sm:min-h-11"
            >
              Apply merits →
            </Link>
          </div>
        ) : null}
      </Card>

      {/* Available Merits */}
      <Card className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-2 pb-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Available Merits
            </span>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Award className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {formatDays(summary.merits.available)}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {summary.merits.totalApplied} applied
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {summary.merits.totalAwarded} total awarded · {summary.merits.expired} expired (1-yr validity)
          </p>
        </div>
      </Card>

      {/* Disciplinary Standing */}
      <Card className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-2 pb-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Overall Standing
            </span>
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                summary.hasOutstandingDebt
                  ? "bg-destructive/10 text-destructive"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {summary.hasOutstandingDebt ? (
                <ShieldAlert className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {summary.totalActiveBalance > 0 ? `${formatDays(summary.totalActiveBalance)} pending` : "In Good Standing"}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {summary.totalActiveDemerits} active units total ·{" "}
            {summary.office.waivedDemerits + summary.rle.waivedDemerits} waived units
          </p>
        </div>
      </Card>
    </div>
  );
}
