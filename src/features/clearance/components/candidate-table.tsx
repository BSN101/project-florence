"use client";

import { useId, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Search, ShieldX, Users, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPhp } from "@/features/finance/calculations";
import { cn } from "@/lib/utils";
import type { CouncilClearanceCandidate } from "../contracts";
import { ConfirmClearanceDialog } from "./confirm-clearance-dialog";

const PAGE_SIZE = 25;
const confirmedFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

function CandidateTableColgroup() {
  return (
    <colgroup>
      <col className="w-[23%]" />
      <col className="w-[13%]" />
      <col className="w-[16%]" />
      <col className="w-[13%]" />
      <col className="w-[15%]" />
      <col className="w-[20%]" />
    </colgroup>
  );
}

function BalanceDisplay({ amount }: { amount: number }) {
  if (amount > 0) {
    return (
      <span className="font-semibold text-amber-600 dark:text-amber-400">
        {formatPhp(amount)}
      </span>
    );
  }
  return <span className="font-mono text-muted-foreground">₱0.00</span>;
}

function DemeritBadge({
  count,
  showLabel = false,
}: {
  count: number;
  showLabel?: boolean;
}) {
  if (count <= 0) {
    return <span className="text-muted-foreground">0</span>;
  }

  if (showLabel) {
    return (
      <span className="font-semibold text-amber-600 dark:text-amber-400">
        {count} active
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
      {count}
    </span>
  );
}

function ClearanceStatusBadge({ confirmedAt }: { confirmedAt: string | null }) {
  if (confirmedAt) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-3" />
          Cleared
        </span>
        <span className="text-[11px] text-muted-foreground">{confirmedFormat.format(new Date(confirmedAt))}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <Clock className="size-3" />
      Pending
    </span>
  );
}

function ClearanceActionButton({
  candidate,
  onSelect,
  fullWidth = false,
}: {
  candidate: CouncilClearanceCandidate;
  onSelect: (candidate: CouncilClearanceCandidate) => void;
  fullWidth?: boolean;
}) {
  const buttonWidthClass = fullWidth ? "w-full min-h-11" : "w-[124px] justify-center ml-auto";

  if (candidate.status.cleared) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled
        className={cn("text-xs text-muted-foreground cursor-default", buttonWidthClass)}
      >
        <CheckCircle2 className="mr-1.5 size-3.5 text-emerald-600" />
        Confirmed
      </Button>
    );
  }

  if (candidate.isSelf) {
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
                buttonWidthClass
              )}
            />
          }
        >
          <ShieldX className="mr-1.5 size-3.5 text-destructive" />
          Your own record
        </TooltipTrigger>
        <TooltipContent side="top">
          Council officers cannot confirm clearance for their own student profile.
        </TooltipContent>
      </Tooltip>
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

export function CandidateTable({
  candidates,
  semesterId,
}: {
  candidates: CouncilClearanceCandidate[];
  semesterId: string;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [clearanceState, setClearanceState] = useState<string>("all");
  const [page, setPage] = useState(0);

  const [selectedCandidate, setSelectedCandidate] = useState<CouncilClearanceCandidate | null>(null);

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
      return true;
    });
  }, [candidates, search, year, status, clearanceState]);

  const yearLabel = year === "all" ? "Year: All Years" : `Year: Year ${year}`;
  const statusLabel =
    status === "all" ? "Status: All Statuses" : status === "regular" ? "Status: Regular" : "Status: Irregular";
  const clearanceLabel =
    clearanceState === "all"
      ? "Clearance: All"
      : clearanceState === "cleared"
      ? "Clearance: Cleared"
      : "Clearance: Pending";

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstIndex = currentPage * PAGE_SIZE;
  const paged = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);

  return (
    <TooltipProvider delay={100}>
      <div className="flex flex-col gap-4">
        {/* Search and Filters Bar - stacked on mobile, full width search */}
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

            {/* Filter buttons - stacked on mobile (grid-cols-1), 3 cols on tablet, flex on desktop */}
            <div className="grid w-full grid-cols-1 gap-2.5 shrink-0 sm:grid-cols-3 xl:flex xl:w-auto xl:items-center xl:gap-2.5">
              {/* Year Filter */}
              <div className="w-full xl:w-[150px]">
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
              <div className="w-full xl:w-[150px]">
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

              {/* Clearance Filter */}
              <div className="w-full xl:w-[160px]">
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
                    <SelectItem value="all">All Clearance</SelectItem>
                    <SelectItem value="cleared">Cleared</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
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
                        <ClearanceStatusBadge confirmedAt={candidate.status.confirmedAt} />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-border/60 pt-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Balance:</span>
                        <BalanceDisplay amount={candidate.totalOutstandingPayable} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Demerits:</span>
                        <DemeritBadge count={candidate.activeCouncilDemerits} showLabel />
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
                <table className="w-full min-w-[840px] table-fixed text-left text-sm">
                  <CandidateTableColgroup />
                  <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3.5 font-medium">Student</th>
                      <th className="px-4 py-3.5 font-medium">Year & Status</th>
                      <th className="px-4 py-3.5 text-right font-medium">Outstanding Balance</th>
                      <th className="px-4 py-3.5 text-center font-medium">Active Demerits</th>
                      <th className="px-4 py-3.5 font-medium">Clearance Status</th>
                      <th className="pl-4 pr-6 py-3.5 text-right font-medium">Action</th>
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

                        {/* Financial Balance */}
                        <td className="px-4 py-3.5 text-right text-xs">
                          <BalanceDisplay amount={candidate.totalOutstandingPayable} />
                        </td>

                        {/* Active Demerits */}
                        <td className="px-4 py-3.5 text-center text-xs">
                          <DemeritBadge count={candidate.activeCouncilDemerits} />
                        </td>

                        {/* Clearance Status */}
                        <td className="px-4 py-3.5">
                          <ClearanceStatusBadge confirmedAt={candidate.status.confirmedAt} />
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
        <ConfirmClearanceDialog
          key={selectedCandidate?.studentId}
          candidate={selectedCandidate}
          semesterId={semesterId}
          isOpen={Boolean(selectedCandidate)}
          onClose={() => setSelectedCandidate(null)}
        />
      </div>
    </TooltipProvider>
  );
}
