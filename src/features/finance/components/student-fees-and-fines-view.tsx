"use client";

import { Suspense, use, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  FileText,
  History,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhp } from "../calculations";
import {
  canRecordCashForStudent,
  type ObligationWithStandingDTO,
  type StudentFinancialAccountData,
  type StudentPaymentAccountDTO,
} from "../contracts";
import { RecordCashPaymentDialog } from "./record-cash-payment-dialog";
import { StudentFinancialSummaryCards } from "./student-financial-summary-cards";
import { StudentObligationsTable } from "./student-obligations-table";
import { StudentPaymentHistoryTable } from "./student-payment-history-table";
import { StudentTransferWizardDialog } from "./student-transfer-wizard-dialog";

type ViewSection = "obligations" | "payments";

/** Wizard-only reads; null when they failed, so only the wizard is unavailable. */
export type TransferWizardData = {
  paymentAccounts: StudentPaymentAccountDTO[];
  obligations: ObligationWithStandingDTO[];
} | null;

/** Cash-dialog reads; null when they failed, so only cash recording is unavailable. */
export type CashPaymentWizardData = ObligationWithStandingDTO[] | null;

function SubmitTransferButton({
  disabled,
  onClick,
  title,
}: {
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full gap-2 text-xs sm:w-auto"
    >
      <Send className="size-3.5" />
      <span>Submit Transfer Evidence</span>
    </Button>
  );
}

function TransferWizardLauncher({
  data,
  isOpen,
  onOpenChange,
  initialSemesterId,
  onViewPaymentHistory,
}: {
  data: Promise<TransferWizardData>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialSemesterId?: string | null;
  onViewPaymentHistory: () => void;
}) {
  const wizard = use(data);
  if (!wizard) {
    return (
      <SubmitTransferButton
        disabled
        title="Transfer submission is unavailable right now. Refresh the page to try again."
      />
    );
  }
  return (
    <>
      <SubmitTransferButton
        onClick={() => onOpenChange(true)}
        disabled={!wizard.obligations.some((item) => item.status === "unpaid")}
      />
      <StudentTransferWizardDialog
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        obligations={wizard.obligations}
        paymentAccounts={wizard.paymentAccounts}
        initialSemesterId={initialSemesterId}
        onViewPaymentHistory={onViewPaymentHistory}
      />
    </>
  );
}

function RecordCashButton({
  disabled,
  onClick,
  title,
}: {
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="min-h-11 w-full gap-2 text-xs sm:min-h-8 sm:w-auto"
    >
      <Banknote className="size-3.5" />
      <span>Record Cash Payment</span>
    </Button>
  );
}

function CashPaymentWizardLauncher({
  data,
  student,
  isOpen,
  onOpenChange,
  initialSemesterId,
  onViewPaymentHistory,
}: {
  data: Promise<CashPaymentWizardData>;
  student: StudentFinancialAccountData["student"];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialSemesterId?: string | null;
  onViewPaymentHistory: () => void;
}) {
  const obligations = use(data);
  if (!obligations) {
    return (
      <RecordCashButton
        disabled
        title="Cash recording is unavailable right now. Refresh the page to try again."
      />
    );
  }
  const hasPayable = obligations.some(
    (item) => item.status === "unpaid" || item.status === "pending_verification"
  );
  return (
    <>
      <RecordCashButton
        onClick={() => onOpenChange(true)}
        disabled={!hasPayable}
        title={
          hasPayable
            ? undefined
            : "No unpaid obligations are available for cash collection."
        }
      />
      <RecordCashPaymentDialog
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        student={student}
        obligations={obligations}
        initialSemesterId={initialSemesterId}
        onViewPaymentHistory={onViewPaymentHistory}
      />
    </>
  );
}

export function StudentFeesAndFinesView({
  data,
  isCouncilView = false,
  wizardData,
  cashWizardData,
  actorProfileId,
  currentSemesterId,
}: {
  data: StudentFinancialAccountData;
  isCouncilView?: boolean;
  wizardData?: Promise<TransferWizardData>;
  cashWizardData?: Promise<CashPaymentWizardData>;
  actorProfileId?: string | null;
  currentSemesterId?: string | null;
}) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<ViewSection>("obligations");
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isCashDialogOpen, setIsCashDialogOpen] = useState(false);

  // Reset transient modal state on route, semester, or student navigation (preserved routes).
  const currentLocation = `${pathname}:${currentSemesterId ?? ""}:${data.student.id}`;
  const [seenLocation, setSeenLocation] = useState(currentLocation);
  if (seenLocation !== currentLocation) {
    setSeenLocation(currentLocation);
    setIsWizardOpen(false);
    setIsCashDialogOpen(false);
  }

  const isSelfStudent = Boolean(
    actorProfileId && !canRecordCashForStudent(actorProfileId, data.student.id)
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

          {!isCouncilView && wizardData && (
            <Suspense fallback={<SubmitTransferButton disabled />}>
              <TransferWizardLauncher
                data={wizardData}
                isOpen={isWizardOpen}
                onOpenChange={setIsWizardOpen}
                initialSemesterId={currentSemesterId}
                onViewPaymentHistory={() => setActiveSection("payments")}
              />
            </Suspense>
          )}

          {isCouncilView && isSelfStudent && (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <RecordCashButton
                disabled
                title="Officers are not permitted to record their own cash payments."
              />
              <span className="text-xs text-muted-foreground">
                Self-recording is not permitted
              </span>
            </div>
          )}

          {isCouncilView && !isSelfStudent && cashWizardData && (
            <Suspense fallback={<RecordCashButton disabled />}>
              <CashPaymentWizardLauncher
                data={cashWizardData}
                student={data.student}
                isOpen={isCashDialogOpen}
                onOpenChange={setIsCashDialogOpen}
                initialSemesterId={currentSemesterId}
                onViewPaymentHistory={() => setActiveSection("payments")}
              />
            </Suspense>
          )}
        </div>

        {activeSection === "obligations" ? (
          <StudentObligationsTable obligations={data.obligations} />
        ) : (
          <StudentPaymentHistoryTable
            payments={data.payments}
            isCouncilView={isCouncilView}
            studentLabel={
              isCouncilView
                ? [data.student.fullName, data.student.universityId]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
