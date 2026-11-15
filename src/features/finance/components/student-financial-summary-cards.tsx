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
  const isFullyCleared = summary.totalOutstandingPayable === 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Outstanding Payable */}
      <Card
        className={
          isFullyCleared
            ? "border-emerald-500/30 bg-emerald-500/5 shadow-xs"
            : "border-amber-500/40 bg-amber-500/5 shadow-xs"
        }
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
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
            className={`text-2xl font-bold tracking-tight ${
              isFullyCleared
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {formatPhp(summary.totalOutstandingPayable)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isFullyCleared
              ? "All active dues settled. Account is cleared."
              : summary.priorSemestersOverduePayable > 0
              ? `Includes ${formatPhp(
                  summary.priorSemestersOverduePayable
                )} overdue from prior terms.`
              : "Current term balance due."}
          </p>
        </CardContent>
      </Card>

      {/* 2. Payments Under Review */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Under Verification
          </CardTitle>
          <Clock className="size-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {formatPhp(summary.totalPendingVerificationAmount)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.totalPendingVerificationAmount > 0
              ? "Transfers submitted, awaiting Council review."
              : "No payments currently pending review."}
          </p>
        </CardContent>
      </Card>

      {/* 3. Settled Amount */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Total Settled
          </CardTitle>
          <Coins className="size-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {formatPhp(summary.totalSettledAmount)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Verified payments credited to your account.
          </p>
        </CardContent>
      </Card>

      {/* 4. Waived Dues */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Officially Waived
          </CardTitle>
          <ShieldCheck className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {formatPhp(summary.totalWaivedAmount)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.totalWaivedAmount > 0
              ? "Excused through approved council waivers."
              : "No waived fees or fines recorded."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
