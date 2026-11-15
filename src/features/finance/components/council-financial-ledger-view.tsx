"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Search,
  User,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StudentRosterItem } from "@/features/students/contracts";
import { displayName, sortName } from "@/lib/format-name";
import type { StudentFinancialAccountData } from "../contracts";
import { StudentFeesAndFinesView } from "./student-fees-and-fines-view";

export function CouncilFinancialLedgerView({
  students,
  initialStudentData,
  currentSemesterId,
}: {
  students: StudentRosterItem[];
  initialStudentData?: StudentFinancialAccountData | null;
  currentSemesterId?: string | null;
}) {
  const router = useRouter();
  const searchInputId = useId();

  const [searchQuery, setSearchQuery] = useState("");
  const [isNavigating, startNavigationTransition] = useTransition();

  const searchResults = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed.length < 2) return [];
    return students
      .filter((s) => {
        const idMatch = s.university_id.toLowerCase().includes(trimmed);
        const nameMatch =
          displayName(s).toLowerCase().includes(trimmed) ||
          sortName(s).toLowerCase().includes(trimmed);
        const emailMatch = s.email
          ? s.email.toLowerCase().includes(trimmed)
          : false;
        return idMatch || nameMatch || emailMatch;
      })
      .slice(0, 10);
  }, [students, searchQuery]);

  function handleSelectStudent(student: StudentRosterItem) {
    setSearchQuery("");
    const params = new URLSearchParams();
    params.set("student", student.student_id);
    if (currentSemesterId) {
      params.set("semester", currentSemesterId);
    }
    startNavigationTransition(() => {
      router.push(`/council/payments?${params.toString()}`);
    });
  }

  function handleClearStudent() {
    setSearchQuery("");
    const params = new URLSearchParams();
    if (currentSemesterId) {
      params.set("semester", currentSemesterId);
    }
    startNavigationTransition(() => {
      router.push(
        params.toString()
          ? `/council/payments?${params.toString()}`
          : "/council/payments"
      );
    });
  }

  return (
    <div className="space-y-6">
      {/* Header & Student Lookup */}
      <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground">
            Student Financial Accounts &amp; Payments
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
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
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student ID, name, or email..."
              className="pl-9 pr-9 text-sm"
            />
            {isNavigating ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery.trim().length >= 2 && (
            <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
              {searchResults.length > 0 ? (
                <>
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Matching Students ({searchResults.length})
                  </div>
                  {searchResults.map((s) => (
                    <button
                      key={s.student_id}
                      type="button"
                      onClick={() => handleSelectStudent(s)}
                      className="w-full text-left flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <div className="truncate">
                        <span className="font-medium">{displayName(s)}</span>
                        {s.email && (
                          <span className="ml-2 text-xs text-muted-foreground truncate">
                            {s.email}
                          </span>
                        )}
                      </div>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground shrink-0">
                        {s.university_id}
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                  No enrolled students match &ldquo;{searchQuery.trim()}&rdquo; in this semester.
                </div>
              )}
            </div>
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
                {initialStudentData.student.universityId && (
                  <div className="text-xs font-mono font-medium text-muted-foreground">
                    ID: {initialStudentData.student.universityId}
                  </div>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearStudent}
              disabled={isNavigating}
              className="text-xs h-8 cursor-pointer self-start sm:self-auto"
            >
              <Users className="size-3.5 mr-1.5" />
              Select Different Student
            </Button>
          </div>

          <StudentFeesAndFinesView
            key={initialStudentData.student.id}
            data={initialStudentData}
            isCouncilView
          />
        </div>
      ) : (
        /* Empty Guidance State */
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card/50">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
            <Search className="size-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Search for a student to view their financial ledger
          </h3>
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
