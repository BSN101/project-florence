import Link from "next/link";
import { AlertTriangle, Award, CheckCircle2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Office Bucket */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Office Duty
          </CardTitle>
          <BucketBadge bucket="office" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {summary.office.balance > 0 ? formatDays(summary.office.balance) : "0 days"}
            </div>
            {summary.office.balance === 0 ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                Clear
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" />
                Sanction
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summary.office.activeDemerits} demerits · {summary.office.appliedMerits} applied merits ·{" "}
            {summary.office.activeServiceCredits} duty credits
          </p>
          {applyOfficeHref ? (
            <div className="mt-2.5 pt-2 border-t border-border/50">
              <Link
                href={applyOfficeHref}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Apply merits →
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* RLE Bucket */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Clinical (RLE) Duty
          </CardTitle>
          <BucketBadge bucket="rle" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {summary.rle.balance > 0 ? formatDays(summary.rle.balance) : "0 days"}
            </div>
            {summary.rle.balance === 0 ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                Clear
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" />
                Sanction
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summary.rle.activeDemerits} demerits · {summary.rle.appliedMerits} applied merits ·{" "}
            {summary.rle.activeServiceCredits} duty credits
          </p>
          {applyRleHref ? (
            <div className="mt-2.5 pt-2 border-t border-border/50">
              <Link
                href={applyRleHref}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Apply merits →
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Available Merits */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Available Merits
          </CardTitle>
          <Award className="size-4 text-emerald-600 dark:text-emerald-400" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatDays(summary.merits.available)}
            </div>
            <span className="text-xs text-muted-foreground">
              {summary.merits.totalApplied} applied
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summary.merits.totalAwarded} total awarded · {summary.merits.expired} expired (1-yr validity)
          </p>
        </CardContent>
      </Card>

      {/* Disciplinary Standing */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overall Standing
          </CardTitle>
          {summary.hasOutstandingDebt ? (
            <ShieldAlert className="size-4 text-destructive" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {summary.totalActiveBalance > 0 ? `${formatDays(summary.totalActiveBalance)} pending` : "In Good Standing"}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summary.totalActiveDemerits} active units total ·{" "}
            {summary.office.waivedDemerits + summary.rle.waivedDemerits} waived units
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
