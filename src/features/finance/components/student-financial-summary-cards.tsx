import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhp } from "../calculations";
import type { StudentFinancialSummaryDTO } from "../contracts";

export function StudentFinancialSummaryCards({
  summary,
}: {
  summary: StudentFinancialSummaryDTO;
}) {
  const hasPending = summary.totalPendingVerificationAmount > 0;
  // A pending transfer settles nothing, so the account is cleared only when nothing is pending either.
  const isFullyCleared = summary.totalOutstandingPayable === 0 && !hasPending;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Outstanding Payable */}
      <Card
        className={
          isFullyCleared
            ? "border border-emerald-500/30 bg-emerald-500/5 shadow-xs"
            : "border border-amber-500/40 bg-amber-500/5 shadow-xs"
        }
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Payable Due
          </CardTitle>
          {isFullyCleared ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={`font-heading text-2xl font-semibold tracking-tight tabular-nums ${
              isFullyCleared
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {formatPhp(summary.totalOutstandingPayable)}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isFullyCleared
              ? "All active dues settled. Account is cleared."
              : summary.totalOutstandingPayable === 0
              ? `Nothing payable; ${formatPhp(summary.totalPendingVerificationAmount)} under review.`
              : summary.priorSemestersOverduePayable > 0
              ? `Includes ${formatPhp(
                  summary.priorSemestersOverduePayable
                )} overdue from prior terms.`
              : "Current term balance due."}
          </p>
        </CardContent>
      </Card>

      {/* 2. Payments Under Review */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Under Verification
          </CardTitle>
          <Clock className="size-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatPhp(summary.totalPendingVerificationAmount)}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {hasPending
              ? "Transfers submitted, awaiting Council review."
              : "No payments currently pending review."}
          </p>
        </CardContent>
      </Card>

      {/* 3. Settled / Net Received Amount */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {summary.totalRefundedAmount > 0 ? "Net Received" : "Total Settled"}
          </CardTitle>
          <Coins className="size-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatPhp(
              summary.totalRefundedAmount > 0
                ? summary.totalNetReceivedAmount
                : summary.totalSettledAmount
            )}
          </div>
          {summary.totalRefundedAmount > 0 ? (
            <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <dt>Gross received</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {formatPhp(summary.totalGrossReceivedAmount)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>Refunds</dt>
                <dd className="font-medium tabular-nums text-destructive">
                  -{formatPhp(summary.totalRefundedAmount)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Verified payments credited to this account.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4. Waived Dues */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Officially Waived
          </CardTitle>
          <ShieldCheck className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatPhp(summary.totalWaivedAmount)}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summary.totalWaivedAmount > 0
              ? "Excused through approved council waivers."
              : "No waived fees or fines recorded."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
