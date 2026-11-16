"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  History,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button"; 
import { formatPhp } from "../calculations";
import type {
  ObligationWithStandingDTO,
  StudentFinancialAccountData,
  StudentPaymentAccountDTO,
} from "../contracts";
import { StudentFinancialSummaryCards } from "./student-financial-summary-cards";
import { StudentObligationsTable } from "./student-obligations-table";
import { StudentPaymentHistoryTable } from "./student-payment-history-table";
import { StudentTransferWizardDialog } from "./student-transfer-wizard-dialog";

type ViewSection = "obligations" | "payments";

export function StudentFeesAndFinesView({
  data,
  isCouncilView = false,
  paymentAccounts = [],
  payableObligations,
  currentSemesterId,
}: {
  data: StudentFinancialAccountData;
  isCouncilView?: boolean;
  paymentAccounts?: StudentPaymentAccountDTO[];
  payableObligations?: ObligationWithStandingDTO[];
  currentSemesterId?: string | null;
}) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<ViewSection>("obligations");
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Reset transient modal state on route or semester navigation (preserved routes).
  const currentLocation = `${pathname}:${currentSemesterId ?? ""}`;
  const [seenLocation, setSeenLocation] = useState(currentLocation);
  if (seenLocation !== currentLocation) {
    setSeenLocation(currentLocation);
    setIsWizardOpen(false);
  }

  const wizardObligations =
    payableObligations ??
    data.obligations.filter(
      (item) =>
        item.status === "unpaid" || item.status === "pending_verification"
    );

  const hasPriorOverdue = data.summary.priorSemestersOverduePayable > 0;

  return (
    <div className="space-y-6">
      {/* Prior Semesters Overdue Policy Notice */}
      {hasPriorOverdue && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-900 dark:text-amber-100">
                Prior Term Collectible Obligations Detected
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {isCouncilView ? "This student has " : "You have "}
                <span className="font-semibold">
                  {formatPhp(data.summary.priorSemestersOverduePayable)}
                </span>{" "}
                in unpaid obligations from previous academic terms. Under
                institutional policy, unpaid obligations remain active and
                collectible after term transitions or clearances until
                officially settled or waived.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Financial Summary Cards */}
      <StudentFinancialSummaryCards summary={data.summary} />

      {/* Main Content Tabs */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 border-b border-border pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Student financial sections"
            className="flex flex-wrap items-center gap-2"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={activeSection === "obligations"}
              variant={activeSection === "obligations" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("obligations")}
              className="gap-2 text-xs"
            >
              <FileText className="size-3.5" />
              <span>Obligations &amp; Dues ({data.obligations.length})</span>
            </Button>

            <Button
              type="button"
              role="tab"
              aria-selected={activeSection === "payments"}
              variant={activeSection === "payments" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("payments")}
              className="gap-2 text-xs"
            >
              <History className="size-3.5" />
              <span>Payment History ({data.payments.length})</span>
            </Button>
          </div>

          {!isCouncilView && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsWizardOpen(true)}
              disabled={wizardObligations.length === 0}
              className="w-full gap-2 text-xs sm:w-auto"
            >
              <Send className="size-3.5" />
              <span>Submit Transfer Evidence</span>
            </Button>
          )}
        </div>

        {activeSection === "obligations" ? (
          <StudentObligationsTable obligations={data.obligations} />
        ) : (
          <StudentPaymentHistoryTable
            payments={data.payments}
            isCouncilView={isCouncilView}
          />
        )}
      </div>

      {!isCouncilView && (
        <StudentTransferWizardDialog
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          obligations={wizardObligations}
          paymentAccounts={paymentAccounts}
          initialSemesterId={currentSemesterId}
          onViewPaymentHistory={() => setActiveSection("payments")}
        />
      )}
    </div>
  );
}
