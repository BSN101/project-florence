"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Search, User, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { displayName, sortName } from "@/lib/format-name";
import { formatPhp } from "../calculations";
import type { CouncilFinancialRosterItem, StudentFinancialAccountData, StudentFinancialSummaryDTO } from "../contracts";
import {
  type CashPaymentWizardData,
  StudentFeesAndFinesView,
} from "./student-fees-and-fines-view";

const PAGE_SIZE = 25;

type Standing = "unpaid" | "under_review" | "cleared";

// Anything payable wins over a pending review: a pending transfer settles nothing (FL-023).
function standingOf(summary: StudentFinancialSummaryDTO): Standing {
  if (summary.totalOutstandingPayable > 0) return "unpaid";
  if (summary.totalPendingVerificationAmount > 0) return "under_review";
  return "cleared";
}

const standingBadges: Record<Standing, [string, string]> = {
  unpaid: ["Unpaid", "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"],
  under_review: ["Under Review", "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"],
  cleared: ["Cleared", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"],
};

function StandingBadge({ summary }: { summary: StudentFinancialSummaryDTO }) {
  const [label, tone] = standingBadges[standingOf(summary)];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
  );
}

const yearOptions = { all: "All Years", "1": "Year 1", "2": "Year 2", "3": "Year 3", "4": "Year 4" };
const statusOptions = { all: "All Statuses", regular: "Regular", irregular: "Irregular" };
const paymentOptions = {
  all: "All Payments",
  unpaid: "Unpaid",
  prior: "Prior-Term Balance",
  under_review: "Under Review",
  cleared: "Cleared",
};

function FilterSelect<T extends Record<string, string>>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: keyof T & string;
  options: T;
  onChange: (value: keyof T & string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange((v ?? "all") as keyof T & string)}>
      <SelectTrigger aria-label={label} className="w-full text-xs lg:w-[170px]">
        <span className="truncate">{label}: {value === "all" ? "All" : options[value]}</span>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([key, text]) => (
          <SelectItem key={key} value={key}>{text}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Semester student list; a row opens that student's ledger (like event list → event detail). */
export function CouncilFinancialRosterTable({
  students,
  semesterId,
}: {
  students: CouncilFinancialRosterItem[];
  semesterId: string;
}) {
  const router = useRouter();
  const searchInputId = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [year, setYear] = useState<keyof typeof yearOptions>("all");
  const [status, setStatus] = useState<keyof typeof statusOptions>("all");
  const [payment, setPayment] = useState<keyof typeof paymentOptions>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (
        q &&
        !s.university_id.toLowerCase().includes(q) &&
        !displayName(s).toLowerCase().includes(q) &&
        !sortName(s).toLowerCase().includes(q) &&
        !s.email?.toLowerCase().includes(q)
      ) return false;
      if (year !== "all" && s.year_level !== Number(year)) return false;
      if (status !== "all" && s.academic_status !== status) return false;
      if (payment === "prior") return s.summary.priorSemestersOverduePayable > 0;
      return payment === "all" || standingOf(s.summary) === payment;
    });
  }, [students, search, year, status, payment]);

  // Every filter change starts again from the first page.
  const resetting = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(0);
  };

  // Clamped so a shrinking list never lands on an empty page.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstIndex = currentPage * PAGE_SIZE;
  const pageStudents = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);
  const href = (s: CouncilFinancialRosterItem) => `?semester=${semesterId}&student=${s.student_id}`;
  const [isOpening, startOpening] = useTransition();
  // The table stays visible while the ledger loads; only the chosen row shows it is opening.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const opening = isOpening ? openingId : null;

  function openStudent(event: React.MouseEvent, s: CouncilFinancialRosterItem) {
    event.stopPropagation();
    // Modifier clicks keep the link's native new-tab/window behaviour.
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (isOpening) return;
    setOpeningId(s.student_id);
    startOpening(() => router.push(href(s)));
  }

  const updateSearch = resetting(setSearch);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground">
            Student Financial Accounts &amp; Payments
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select a student to inspect their dues, prior-term carryovers and payment history.
          </p>
        </div>
        <div className="relative w-full max-w-md">
          <label htmlFor={searchInputId} className="sr-only">
            Search students
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            id={searchInputId}
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") updateSearch("");
            }}
            placeholder="Search by student ID, name, or email..."
            className="pl-9 pr-9 text-sm"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => updateSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:flex lg:justify-end">
        <FilterSelect label="Year" value={year} options={yearOptions} onChange={resetting(setYear)} />
        <FilterSelect label="Status" value={status} options={statusOptions} onChange={resetting(setStatus)} />
        <FilterSelect label="Payment" value={payment} options={paymentOptions} onChange={resetting(setPayment)} />
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {filtered.length === 0 ? (
            <>Showing <strong>0</strong> of {students.length} students</>
          ) : (
            <>
              Showing <strong>{firstIndex + 1}–{firstIndex + pageStudents.length}</strong> of {filtered.length} students
              {filtered.length !== students.length && <> (filtered from {students.length})</>}
            </>
          )}
        </span>
        {pageCount > 1 && (
          <nav aria-label="Student pages" className="flex items-center gap-2">
            <Button variant="outline" size="sm" aria-label="Previous page"
              disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" aria-label="Next page"
              disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </nav>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="h-[600px] overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Users className="size-8 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                {students.length === 0
                  ? "No students are enrolled in this semester."
                  : "No students match your search or filters."}
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-xs text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-3.5">Student Number</th>
                  <th className="px-4 py-3.5">Full Name</th>
                  <th className="px-4 py-3.5">Year</th>
                  <th className="px-4 py-3.5 text-right">Payable</th>
                  <th className="px-4 py-3.5 text-right">Under Review</th>
                  <th className="px-4 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-border/60 ${opening ? "[&>tr:not([aria-busy=true])]:opacity-50" : ""}`}>
                {pageStudents.map((s) => (
                  <tr
                    key={s.student_id}
                    onClick={(e) => openStudent(e, s)}
                    aria-busy={opening === s.student_id}
                    className={`cursor-pointer transition-[background-color,opacity] hover:bg-muted/40 ${opening === s.student_id ? "bg-muted/60" : ""}`}
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-foreground">{s.university_id}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        {/* The row is clickable; the name stays a real link for keyboard and screen readers. */}
                        <Link href={href(s)} onClick={(e) => openStudent(e, s)}
                          className="font-medium text-foreground underline-offset-4 hover:underline">
                          {sortName(s)}
                        </Link>
                        {opening === s.student_id && (
                          <span role="status" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Opening ledger…
                          </span>
                        )}
                        {s.email && <span className="text-[11px] text-muted-foreground">{s.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground">Year {s.year_level}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {s.summary.totalOutstandingPayable > 0 ? formatPhp(s.summary.totalOutstandingPayable) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                      {s.summary.totalPendingVerificationAmount > 0 ? formatPhp(s.summary.totalPendingVerificationAmount) : "—"}
                    </td>
                    <td className="px-4 py-3.5"><StandingBadge summary={s.summary} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/** One student's ledger, opened from the student table. */
export function CouncilStudentLedger({
  data,
  backHref,
  cashWizardData,
  actorProfileId,
  currentSemesterId,
}: {
  data: StudentFinancialAccountData;
  backHref: string;
  cashWizardData?: Promise<CashPaymentWizardData>;
  actorProfileId?: string | null;
  currentSemesterId?: string | null;
}) {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="w-fit gap-1" nativeButton={false} render={<Link href={backHref} />}>
        <ArrowLeft className="size-4" /> All students
      </Button>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="size-5" />
        </div>
        <div>
          <div className="text-base font-semibold text-foreground">{data.student.fullName}</div>
          {data.student.universityId && (
            <div className="text-xs font-mono font-medium text-muted-foreground">ID: {data.student.universityId}</div>
          )}
        </div>
      </div>
      <StudentFeesAndFinesView
        key={data.student.id}
        data={data}
        isCouncilView
        cashWizardData={cashWizardData}
        actorProfileId={actorProfileId}
        currentSemesterId={currentSemesterId}
      />
    </div>
  );
}
