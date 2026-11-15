"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  History,
  Loader2,
  Search,
  User,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchStudentsForLedgerAction } from "../actions";
import { formatPhp } from "../calculations";
import type { StudentFinancialAccountData } from "../contracts";
import { StudentFinancialSummaryCards } from "./student-financial-summary-cards";
import { StudentObligationsTable } from "./student-obligations-table";
import { StudentPaymentHistoryTable } from "./student-payment-history-table";

type ViewSection = "obligations" | "payments";

type StudentSearchResult = {
  id: string;
  university_id: string | null;
  fullName: string;
  email: string | null;
};

export function CouncilFinancialLedgerView({
  initialStudentData,
  currentSemesterId,
}: {
  initialStudentData?: StudentFinancialAccountData | null;
  currentSemesterId?: string | null;
}) {
  const router = useRouter();
  const searchInputId = useId();

  const [activeSection, setActiveSection] = useState<ViewSection>("obligations");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);

  function handleSearch(term: string) {
    setSearchQuery(term);
    setSearchError(null);

    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    startSearchTransition(async () => {
      const res = await searchStudentsForLedgerAction(trimmed);
      if (res.success) {
        setSearchResults(res.results);
      } else {
        setSearchError(res.error);
        setSearchResults([]);
      }
    });
  }

  function handleSelectStudent(student: StudentSearchResult) {
    setSearchQuery("");
    setSearchResults([]);
    const params = new URLSearchParams();
    params.set("student", student.id);
    if (currentSemesterId) {
      params.set("semester", currentSemesterId);
    }
    router.push(`/council/payments?${params.toString()}`);
  }

  function handleClearStudent() {
    setSearchQuery("");
    setSearchResults([]);
    const params = new URLSearchParams();
    if (currentSemesterId) {
      params.set("semester", currentSemesterId);
    }
    router.push(
      params.toString() ? `/council/payments?${params.toString()}` : "/council/payments"
    );
  }

  const hasPriorOverdue =
    (initialStudentData?.summary.priorSemestersOverduePayable ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header & Student Lookup */}
      <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Student Financial Accounts &amp; Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inspect individual student dues, past semester carryovers, and payment audit logs.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full max-w-md">
          <label htmlFor={searchInputId} className="sr-only">
            Search student
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id={searchInputId}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by student ID, name, or email..."
              className="pl-9 pr-9 text-sm"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
              <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Matching Students ({searchResults.length})
              </div>
              {searchResults.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectStudent(s)}
                  className="w-full text-left flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <div className="truncate">
                    <span className="font-medium">{s.fullName}</span>
                    {s.email && (
                      <span className="ml-2 text-xs text-muted-foreground truncate">
                        {s.email}
                      </span>
                    )}
                  </div>
                  {s.university_id && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground shrink-0">
                      {s.university_id}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {searchError && (
            <p className="mt-1 text-xs text-destructive">{searchError}</p>
          )}
        </div>
      </div>

      {/* Selected Student View */}
      {initialStudentData ? (
        <div className="space-y-6">
          {/* Active Student Identity Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">
                  {initialStudentData.student.fullName}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {initialStudentData.student.universityId && (
                    <span className="font-mono font-medium">
                      ID: {initialStudentData.student.universityId}
                    </span>
                  )}
                  {initialStudentData.targetSemesterCode && (
                    <span>
                      · Context: {initialStudentData.targetSemesterCode}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearStudent}
              className="text-xs h-8 cursor-pointer self-start sm:self-auto"
            >
              <Users className="size-3.5 mr-1.5" />
              Select Different Student
            </Button>
          </div>

          {/* Prior Terms Overdue Policy Notice */}
          {hasPriorOverdue && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-900 dark:text-amber-100">
                    Prior Term Collectible Obligations Detected
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    This student has{" "}
                    <span className="font-semibold">
                      {formatPhp(
                        initialStudentData.summary.priorSemestersOverduePayable
                      )}
                    </span>{" "}
                    in unpaid obligations from previous academic terms. Under
                    institutional policy, unpaid obligations remain active and
                    collectible across term transitions or clearances until
                    officially settled or waived.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Student Financial Summary Cards */}
          <StudentFinancialSummaryCards summary={initialStudentData.summary} />

          {/* Tabbed View: Obligations vs Payments */}
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
                  {initialStudentData.obligations.length}
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
                  {initialStudentData.payments.length}
                </span>
              </button>
            </div>

            {activeSection === "obligations" ? (
              <StudentObligationsTable
                obligations={initialStudentData.obligations}
              />
            ) : (
              <StudentPaymentHistoryTable
                payments={initialStudentData.payments}
              />
            )}
          </div>
        </div>
      ) : (
        /* Empty Guidance State */
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card/50">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
            <Search className="size-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Search for a student to view their financial ledger
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            Use the search bar above to look up any enrolled student by their
            university ID, name, or email. You will be able to review their
            active dues, previous semester carryovers, payment records, and
            waiver history.
          </p>
        </div>
      )}
    </div>
  );
}
