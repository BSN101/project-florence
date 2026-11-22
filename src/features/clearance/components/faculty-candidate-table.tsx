"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Search,
  ShieldX,
  Users,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  FACULTY_CLEARANCE_CONFIG,
  type ClearanceStatus,
  type FacultyClearanceCandidate,
  type FacultyClearanceComponent,
} from "../contracts";
import { ConfirmFacultyClearanceDialog } from "./confirm-faculty-clearance-dialog";
import { StudentDisciplineDrilldownDialog } from "./student-discipline-drilldown-dialog";

const PAGE_SIZE = 25;
const confirmedFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

function CandidateTableColgroup() {
  return (
    <colgroup>
      <col className="w-[23%]" />
      <col className="w-[11%]" />
      <col className="w-[15%]" />
      <col className="w-[15%]" />
      <col className="w-[20%]" />
      <col className="w-[16%]" />
    </colgroup>
  );
}

function CouncilPrerequisiteBadge({
  cleared,
  confirmedAt,
}: {
  cleared: boolean;
  confirmedAt: string | null;
}) {
  if (cleared) {
    return (
      <div className="flex flex-col items-start leading-tight">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5 shrink-0 stroke-[2.5]" />
          Council cleared
        </span>
        {confirmedAt && (
          <span className="text-[11px] text-muted-foreground pl-4">
            {confirmedFormat.format(new Date(confirmedAt))}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 shrink-0 rounded-full border border-muted-foreground/60" aria-hidden="true" />
      Awaiting council
    </span>
  );
}

function BucketBalanceBadge({
  candidate,
  onInspect,
}: {
  candidate: FacultyClearanceCandidate;
  onInspect: (candidate: FacultyClearanceCandidate) => void;
}) {
  const hasDebt = candidate.netBalance > 0;
  const daysText = `${candidate.netBalance} ${candidate.netBalance === 1 ? "day" : "days"}`;

  return (
    <div className="inline-flex items-center gap-1.5">
      {hasDebt ? (
        <div className="flex flex-col items-start leading-tight">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            {daysText}
          </span>
          <span className="text-[11px] text-muted-foreground">
            in debt
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground font-normal">
          0 days
        </span>
      )}
      <button
        type="button"
        onClick={() => onInspect(candidate)}
        aria-label={`Inspect disciplinary history for ${candidate.name}`}
        title="View disciplinary history"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors max-md:min-h-11 max-md:min-w-11 md:p-1"
      >
        <ExternalLink className="size-3.5" />
      </button>
    </div>
  );
}

function ClearanceItemStatus({ status }: { status: ClearanceStatus }) {
  if (status.cleared) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
        title={
          status.confirmedAt
            ? `Confirmed${status.confirmedByName ? ` by ${status.confirmedByName}` : ""} on ${confirmedFormat.format(new Date(status.confirmedAt))}`
            : "Cleared"
        }
      >
        <Check className="size-3.5 shrink-0 stroke-[2.5]" />
        Cleared
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      Pending
    </span>
  );
}

function DisabledAction({
  children,
  reason,
  className,
}: {
  children: ReactNode;
  reason: string;
  className: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="button"
            tabIndex={0}
            aria-disabled="true"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "cursor-not-allowed border-dashed text-xs text-muted-foreground opacity-60",
              className
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  );
}

function ClearanceActionButton({
  candidate,
  onSelect,
  fullWidth = false,
}: {
  candidate: FacultyClearanceCandidate;
  onSelect: (candidate: FacultyClearanceCandidate) => void;
  fullWidth?: boolean;
}) {
  const buttonWidthClass = fullWidth ? "w-full min-h-11" : "w-[124px] justify-center ml-auto";

  if (candidate.status.cleared) {
    return (
      <div className={cn("flex items-center", fullWidth ? "w-full justify-center py-2" : "justify-end pr-2")}>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          <Check className="size-3.5 shrink-0 stroke-[2.5]" />
          Granted
        </span>
      </div>
    );
  }

  if (candidate.isSelf) {
    return (
      <DisabledAction className={buttonWidthClass} reason="Coordinators cannot confirm clearance for their own student profile.">
        <ShieldX className="mr-1.5 size-3.5 text-destructive" />
        Your record
      </DisabledAction>
    );
  }

  if (!candidate.councilCleared) {
    return (
      <DisabledAction className={buttonWidthClass} reason="Council clearance must be confirmed first for this student and semester.">
        <Clock className="mr-1.5 size-3.5 text-muted-foreground" />
        Needs Council
      </DisabledAction>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onSelect(candidate)}
      className={cn("text-xs", buttonWidthClass)}
    >
      Grant clearance
    </Button>
  );
}

export function FacultyCandidateTable({
  candidates,
  semesterId,
  component,
}: {
  candidates: FacultyClearanceCandidate[];
  semesterId: string;
  component: FacultyClearanceComponent;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [clearanceState, setClearanceState] = useState<string>("all");
  const [councilFilter, setCouncilFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const [selectedCandidate, setSelectedCandidate] = useState<FacultyClearanceCandidate | null>(null);
  const [inspectingCandidate, setInspectingCandidate] = useState<FacultyClearanceCandidate | null>(null);

  const config = FACULTY_CLEARANCE_CONFIG[component];
  const componentLabel = config.label;
  const bucketLabel = config.bucketLabel;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !item.studentNumber.toLowerCase().includes(q)) {
        return false;
      }
      if (year !== "all" && item.yearLevel.toString() !== year) {
        return false;
      }
      if (status !== "all" && item.academicStatus.toLowerCase() !== status.toLowerCase()) {
        return false;
      }
      if (clearanceState === "cleared" && !item.status.cleared) {
        return false;
      }
      if (clearanceState === "pending" && item.status.cleared) {
        return false;
      }
      if (councilFilter === "cleared" && !item.councilCleared) {
        return false;
      }
      if (councilFilter === "pending" && item.councilCleared) {
        return false;
      }
      return true;
    });
  }, [candidates, search, year, status, clearanceState, councilFilter]);

  const yearLabel = year === "all" ? "Year: All Years" : `Year: Year ${year}`;
  const statusLabel =
    status === "all" ? "Status: All Statuses" : status === "regular" ? "Status: Regular" : "Status: Irregular";
  const clearanceLabel =
    clearanceState === "all"
      ? `${componentLabel}: All`
      : clearanceState === "cleared"
      ? `${componentLabel}: Cleared`
      : `${componentLabel}: Pending`;
  const councilLabel =
    councilFilter === "all"
      ? "Council: All"
      : councilFilter === "cleared"
      ? "Council: Cleared"
      : "Council: Pending";

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstIndex = currentPage * PAGE_SIZE;
  const paged = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);

  return (
    <TooltipProvider delay={100}>
      <div className="flex flex-col gap-4">
        {/* Search and Filters Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1 sm:min-w-[280px]">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id={searchId}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search by student number or name..."
                className="pl-9 pr-8 text-xs sm:text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPage(0);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Filter selects */}
            <div className="grid w-full grid-cols-1 gap-3 shrink-0 sm:grid-cols-2 xl:flex xl:w-auto xl:items-center xl:gap-3">
              {/* Year Filter */}
              <div className="w-full xl:w-[140px]">
                <Select
                  value={year}
                  onValueChange={(val) => {
                    setYear(val ?? "all");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <span className="truncate">{yearLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    <SelectItem value="1">Year 1</SelectItem>
                    <SelectItem value="2">Year 2</SelectItem>
                    <SelectItem value="3">Year 3</SelectItem>
                    <SelectItem value="4">Year 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="w-full xl:w-[140px]">
                <Select
                  value={status}
                  onValueChange={(val) => {
                    setStatus(val ?? "all");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <span className="truncate">{statusLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="irregular">Irregular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Council Prerequisite Filter */}
              <div className="w-full xl:w-[150px]">
                <Select
                  value={councilFilter}
                  onValueChange={(val) => {
                    setCouncilFilter(val ?? "all");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <span className="truncate">{councilLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Council</SelectItem>
                    <SelectItem value="cleared">Council Cleared</SelectItem>
                    <SelectItem value="pending">Awaiting Council</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Faculty Clearance Filter */}
              <div className="w-full xl:w-[150px]">
                <Select
                  value={clearanceState}
                  onValueChange={(val) => {
                    setClearanceState(val ?? "all");
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <span className="truncate">{clearanceLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {componentLabel}</SelectItem>
                    <SelectItem value="cleared">{componentLabel} Cleared</SelectItem>
                    <SelectItem value="pending">{componentLabel} Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Counter & Pagination Bar */}
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>
            {filtered.length === 0 ? (
              <>Showing <strong>0</strong> of {candidates.length} students</>
            ) : (
              <>
                Showing <strong>{firstIndex + 1}–{firstIndex + paged.length}</strong> of {filtered.length} students
                {filtered.length !== candidates.length && <> (filtered from {candidates.length})</>}
              </>
            )}
          </span>
          {pageCount > 1 && (
            <nav aria-label="Clearance candidate pages" className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous page"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
                className="h-7 px-2 text-xs max-md:size-11"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next page"
                disabled={currentPage === pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
                className="h-7 px-2 text-xs max-md:size-11"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </nav>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
            <Users className="size-8 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              No students match your filter criteria. Try clearing or adjusting the search query.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View (< md) */}
            <div className="pb-1 md:hidden">
              <div className="grid grid-cols-1 gap-3">
                {paged.map((candidate) => (
                  <div
                    key={candidate.studentId}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {candidate.studentNumber}
                        </span>
                        <h4 className="font-heading text-sm font-semibold text-foreground break-words">
                          {candidate.name}
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Year {candidate.yearLevel}</span>
                          <span>•</span>
                          <span className="capitalize">{candidate.academicStatus}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {candidate.status.cleared ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3.5 shrink-0 stroke-[2.5]" />
                            Granted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-border/60 pt-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Council Clearance:</span>
                        <CouncilPrerequisiteBadge
                          cleared={candidate.councilCleared}
                          confirmedAt={candidate.councilConfirmedAt}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground font-normal">Academic</span>
                        <ClearanceItemStatus status={candidate.academicClearance} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground font-normal">RLE</span>
                        <ClearanceItemStatus status={candidate.rleClearance} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{bucketLabel} Balance:</span>
                        <BucketBalanceBadge candidate={candidate} onInspect={setInspectingCandidate} />
                      </div>

                      <div className="pt-2">
                        <ClearanceActionButton
                          candidate={candidate}
                          onSelect={setSelectedCandidate}
                          fullWidth
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tablet & Desktop Table View (>= md) */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block shadow-xs">
              <div className="max-h-[560px] overflow-auto clearance-scrollbar">
                <table className="w-full min-w-[880px] table-fixed text-left text-sm">
                  <CandidateTableColgroup />
                  <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium">Year & Status</th>
                      <th className="px-4 py-3 font-medium">Council Prerequisite</th>
                      <th className="px-4 py-3 font-medium">{bucketLabel} Bucket Balance</th>
                      <th className="px-4 py-3 font-medium">Clearance Status</th>
                      <th className="pl-4 pr-6 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paged.map((candidate) => (
                      <tr key={candidate.studentId} className="transition-colors hover:bg-muted/40">
                        {/* Student Info */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{candidate.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {candidate.studentNumber}
                            </span>
                          </div>
                        </td>

                        {/* Year & Status */}
                        <td className="px-4 py-3.5 text-xs text-foreground">
                          <div>Year {candidate.yearLevel}</div>
                          <div className="capitalize text-muted-foreground">{candidate.academicStatus}</div>
                        </td>

                        {/* Council Clearance Prerequisite */}
                        <td className="px-4 py-3.5">
                          <CouncilPrerequisiteBadge
                            cleared={candidate.councilCleared}
                            confirmedAt={candidate.councilConfirmedAt}
                          />
                        </td>

                        {/* Disciplinary Bucket Balance & Ledger Link */}
                        <td className="px-4 py-3.5">
                          <BucketBalanceBadge candidate={candidate} onInspect={setInspectingCandidate} />
                        </td>

                        {/* Faculty Clearance Status */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1.5 text-xs">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="w-16 shrink-0 text-muted-foreground font-normal">Academic</span>
                              <ClearanceItemStatus status={candidate.academicClearance} />
                            </div>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="w-16 shrink-0 text-muted-foreground font-normal">RLE</span>
                              <ClearanceItemStatus status={candidate.rleClearance} />
                            </div>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="pl-4 pr-6 py-3.5 text-right">
                          <ClearanceActionButton
                            candidate={candidate}
                            onSelect={setSelectedCandidate}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Confirmation Dialog */}
        <ConfirmFacultyClearanceDialog
          key={selectedCandidate?.studentId}
          candidate={selectedCandidate}
          semesterId={semesterId}
          component={component}
          isOpen={Boolean(selectedCandidate)}
          onClose={() => setSelectedCandidate(null)}
        />

        {/* Disciplinary Ledger Drilldown Dialog */}
        <StudentDisciplineDrilldownDialog
          key={`drilldown-${inspectingCandidate?.studentId}`}
          studentId={inspectingCandidate?.studentId ?? null}
          studentName={inspectingCandidate?.name ?? null}
          studentNumber={inspectingCandidate?.studentNumber ?? null}
          isOpen={Boolean(inspectingCandidate)}
          onClose={() => setInspectingCandidate(null)}
        />
      </div>
    </TooltipProvider>
  );
}
