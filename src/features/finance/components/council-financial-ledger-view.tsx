"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, LoaderCircle, Search, User, Users, X } from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FilterSelect,
  TableEmpty,
  TableFrame,
  usePagedRows,
  type FilterOption,
} from "@/features/discipline/components/table-controls";
import { displayName, sortName } from "@/lib/format-name";
import { formatPhp } from "../calculations";
import type { CouncilFinancialRosterItem, StudentFinancialAccountData, StudentFinancialSummaryDTO } from "../contracts";
import {
  type CashPaymentWizardData,
  StudentFeesAndFinesView,
} from "./student-fees-and-fines-view";

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

const YEAR_OPTIONS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "1", label: "Year 1" },
  { value: "2", label: "Year 2" },
  { value: "3", label: "Year 3" },
  { value: "4", label: "Year 4" },
];
const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "regular", label: "Regular" },
  { value: "irregular", label: "Irregular" },
];
const PAYMENT_OPTIONS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "prior", label: "Prior-Term Balance" },
  { value: "under_review", label: "Under Review" },
  { value: "cleared", label: "Cleared" },
];

/** Semester student list; the View button opens that student's ledger. */
export function CouncilFinancialRosterTable({
  students,
  semesterId,
  renderedAt,
}: {
  students: CouncilFinancialRosterItem[];
  semesterId: string;
  renderedAt?: string;
}) {
  const router = useRouter();
  const searchInputId = useId();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");

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

  const { pageRows, pager } = usePagedRows(filtered, `${search}|${year}|${status}|${payment}`);
  const hasActiveFilter = search.trim() !== "" || year !== "all" || status !== "all" || payment !== "all";
  const href = (s: CouncilFinancialRosterItem) => `?semester=${semesterId}&student=${s.student_id}`;
  const [isOpening, startOpening] = useTransition();
  // The table stays visible while the ledger loads; only the chosen row shows it is opening.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const opening = isOpening ? openingId : null;

  function openStudent(event: React.MouseEvent, s: CouncilFinancialRosterItem) {
    // Modifier clicks keep the link's native new-tab/window behaviour.
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (isOpening) return;
    setOpeningId(s.student_id);
    startOpening(() => router.push(href(s), { transitionTypes: ["nav-forward"] }));
  }

  function viewAction(s: CouncilFinancialRosterItem) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="gap-1 text-xs"
        nativeButton={false}
        aria-busy={opening === s.student_id}
        render={
          <Link
            href={href(s)}
            transitionTypes={["nav-forward"]}
            onClick={(e) => openStudent(e, s)}
          />
        }
      >
        {opening === s.student_id ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Eye className="size-3.5" />
        )}
        View
      </Button>
    );
  }

  const filters = (
    <>
      <div className="relative w-full sm:max-w-xs">
        <label htmlFor={searchInputId} className="sr-only">
          Search students
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchInputId}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearch("");
          }}
          placeholder="Search by student ID, name, or email..."
          className="pl-8 pr-8 text-sm"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <FilterSelect label="Year" value={year} options={YEAR_OPTIONS} onChange={setYear} />
      <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      <FilterSelect label="Payment" value={payment} options={PAYMENT_OPTIONS} onChange={setPayment} />
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title text-foreground">
            Student Financial Accounts &amp; Payments
          </h2>
          <p className="text-sm text-muted-foreground">
            Select a student to inspect their dues, prior-term carryovers and payment history.
          </p>
        </div>
        {renderedAt && <RefreshButton renderedAt={renderedAt} />}
      </div>

      <TableFrame pager={pager} filters={filters}>
        {filtered.length === 0 ? (
          <TableEmpty
            icon={Users}
            filtered={hasActiveFilter}
            title="No students in this semester"
            text="Enrolled students for this semester will appear here."
          />
        ) : (
          <>
            {/* Phones: one card per student instead of a sideways-scrolling table. */}
            <ul className="divide-y divide-border sm:hidden">
              {pageRows.map((s) => (
                <li key={s.student_id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{sortName(s)}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums">{s.university_id}</span> · Year {s.year_level}
                        {s.email && ` · ${s.email}`}
                      </p>
                    </div>
                    <StandingBadge summary={s.summary} />
                  </div>
                  {(s.summary.totalOutstandingPayable > 0 || s.summary.totalPendingVerificationAmount > 0) && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {s.summary.totalOutstandingPayable > 0 && `Payable ${formatPhp(s.summary.totalOutstandingPayable)}`}
                      {s.summary.totalOutstandingPayable > 0 && s.summary.totalPendingVerificationAmount > 0 && " · "}
                      {s.summary.totalPendingVerificationAmount > 0 && `Under review ${formatPhp(s.summary.totalPendingVerificationAmount)}`}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">{viewAction(s)}</div>
                </li>
              ))}
            </ul>

            <div className="hidden sm:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">Student Number</th>
                    <th scope="col" className="px-4 py-3">Full Name</th>
                    <th scope="col" className="px-4 py-3">Year</th>
                    <th scope="col" className="px-4 py-3 text-right">Payable</th>
                    <th scope="col" className="px-4 py-3 text-right">Under Review</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-border ${opening ? "[&>tr:not([aria-busy=true])]:opacity-50" : ""}`}>
                  {pageRows.map((s) => (
                    <tr
                      key={s.student_id}
                      aria-busy={opening === s.student_id}
                      className={`transition-colors hover:bg-muted/40 ${opening === s.student_id ? "bg-muted/60" : ""}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium tabular-nums text-foreground">
                        {s.university_id}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{sortName(s)}</p>
                        {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        Year {s.year_level}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-foreground">
                        {s.summary.totalOutstandingPayable > 0 ? formatPhp(s.summary.totalOutstandingPayable) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                        {s.summary.totalPendingVerificationAmount > 0 ? formatPhp(s.summary.totalPendingVerificationAmount) : "—"}
                      </td>
                      <td className="px-4 py-3"><StandingBadge summary={s.summary} /></td>
                      <td className="space-x-1 whitespace-nowrap px-4 py-3 text-right">
                        {viewAction(s)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </TableFrame>
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
  renderedAt,
}: {
  data: StudentFinancialAccountData;
  backHref: string;
  cashWizardData?: Promise<CashPaymentWizardData>;
  actorProfileId?: string | null;
  currentSemesterId?: string | null;
  renderedAt?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-1"
          nativeButton={false}
          render={<Link href={backHref} transitionTypes={["nav-back"]} />}
        >
          <ArrowLeft className="size-4" /> All students
        </Button>
        {renderedAt && <RefreshButton renderedAt={renderedAt} />}
      </div>
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
