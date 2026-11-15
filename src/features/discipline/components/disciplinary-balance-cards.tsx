import { AlertTriangle, Award, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentDisciplinarySummary } from "../contracts";
import { BucketBadge } from "./disciplinary-badges";

export function DisciplinaryBalanceCards({
  summary,
}: {
  summary: StudentDisciplinarySummary;
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
            <div className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {summary.office.balance > 0 ? `${summary.office.balance} days` : "0 days"}
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
            <div className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {summary.rle.balance > 0 ? `${summary.rle.balance} days` : "0 days"}
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
            <div className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {summary.merits.available} days
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
            <div className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {summary.totalActiveBalance > 0 ? `${summary.totalActiveBalance} days pending` : "In Good Standing"}
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
