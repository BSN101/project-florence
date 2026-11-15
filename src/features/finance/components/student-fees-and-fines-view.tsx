"use client";

import { useState } from "react";
import {
  AlertTriangle,
  FileText,
  History,
} from "lucide-react";

import { formatPhp } from "../calculations";
import type { StudentFinancialAccountData } from "../contracts";
import { StudentFinancialSummaryCards } from "./student-financial-summary-cards";
import { StudentObligationsTable } from "./student-obligations-table";
import { StudentPaymentHistoryTable } from "./student-payment-history-table";

type ViewSection = "obligations" | "payments";

export function StudentFeesAndFinesView({
  data,
  isCouncilView = false,
}: {
  data: StudentFinancialAccountData;
  isCouncilView?: boolean;
}) {
  const [activeSection, setActiveSection] = useState<ViewSection>("obligations");

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
      <div className="space-y-4 pt-2">
        <div
          role="tablist"
          aria-label="Student financial sections"
          className="flex border-b border-border"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "obligations"}
            onClick={() => setActiveSection("obligations")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors cursor-pointer ${
              activeSection === "obligations"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="size-4" />
            Obligations &amp; Dues
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              {data.obligations.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "payments"}
            onClick={() => setActiveSection("payments")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors cursor-pointer ${
              activeSection === "payments"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="size-4" />
            Payment History
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              {data.payments.length}
            </span>
          </button>
        </div>

        {activeSection === "obligations" ? (
          <StudentObligationsTable obligations={data.obligations} />
        ) : (
          <StudentPaymentHistoryTable payments={data.payments} />
        )}
      </div>
    </div>
  );
}
