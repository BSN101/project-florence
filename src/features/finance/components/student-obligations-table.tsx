"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { formatPhDate, formatPhp } from "../calculations";
import type { ObligationWithStandingDTO } from "../contracts";

const PAGE_SIZE = 25;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "fee", label: "Fee" },
  { value: "fine", label: "Fine" },
] as const;

const STANDING_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "pending_verification", label: "Under Review" },
  { value: "settled", label: "Settled" },
  { value: "waived", label: "Waived" },
] as const;

export function StudentObligationsTable({
  obligations,
}: {
  obligations: ObligationWithStandingDTO[];
}) {
  const [category, setCategory] = useState("all");
  const [standing, setStanding] = useState("all");
  const [inspectingWaiver, setInspectingWaiver] =
    useState<ObligationWithStandingDTO | null>(null);

  const filteredObligations = obligations.filter(
    (item) =>
      (category === "all" || item.kind === category) &&
      (standing === "all" || item.status === standing)
  );

  const filterKey = `${category}|${standing}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 0 });
  const pageCount = Math.max(1, Math.ceil(filteredObligations.length / PAGE_SIZE));
  const page =
    pageState.key === filterKey
      ? Math.min(pageState.page, pageCount - 1)
      : 0;
  const first = page * PAGE_SIZE;
  const pageRows = filteredObligations.slice(first, first + PAGE_SIZE);
  const setPage = (next: number) => setPageState({ key: filterKey, page: next });

  const currentCategoryLabel =
    CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label ?? "All";
  const currentStandingLabel =
    STANDING_OPTIONS.find((opt) => opt.value === standing)?.label ?? "All";

  return (
    <div className="flex flex-col gap-3">
      {/* Filter Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select
          value={category}
          onValueChange={(next) => setCategory(next ?? "all")}
        >
          <SelectTrigger
            className="w-full text-xs sm:w-[150px]"
            aria-label="Category"
          >
            <span className="truncate">Category: {currentCategoryLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={standing}
          onValueChange={(next) => setStanding(next ?? "all")}
        >
          <SelectTrigger
            className="w-full text-xs sm:w-[150px]"
            aria-label="Standing"
          >
            <span className="truncate">Standing: {currentStandingLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {STANDING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fixed Height Table Container with Sticky Header */}
      <div className="h-[26rem] overflow-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs">
        {filteredObligations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <CheckCircle2 className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">
              {obligations.length > 0
                ? "No records match these filters"
                : "No obligations found"}
            </p>
            <p className="text-xs text-muted-foreground">
              {obligations.length > 0
                ? "Change or clear the filters above."
                : "There are no fees or fines assigned for this period."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Description
                </th>
                <th scope="col" className="px-4 py-3">
                  Category
                </th>
                <th scope="col" className="px-4 py-3">
                  Term
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  Standing
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {pageRows.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  {/* Description */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {item.description}
                    </div>
                    {item.is_past_semester && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                        <AlertCircle className="size-3" />
                        Prior Term Carryover
                      </span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                        item.kind === "fee"
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                          : "bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20"
                      }`}
                    >
                      {item.kind}
                      {item.consequence_outcome ? ` · ${item.consequence_outcome}` : ""}
                    </span>
                  </td>

                  {/* Term */}
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {item.semester_code || "—"}
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right font-mono font-medium text-foreground whitespace-nowrap">
                    {formatPhp(item.amount)}
                  </td>

                  {/* Standing Badge */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {item.status === "settled" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="size-3" />
                        Settled
                      </span>
                    )}
                    {item.status === "pending_verification" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                        <Clock className="size-3" />
                        Under Review
                      </span>
                    )}
                    {item.status === "waived" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 border border-slate-500/20">
                        <ShieldCheck className="size-3" />
                        Waived
                      </span>
                    )}
                    {item.status === "unpaid" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20">
                        <AlertCircle className="size-3" />
                        Unpaid
                      </span>
                    )}
                  </td>

                  {/* Details / Action */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {item.status === "waived" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectingWaiver(item)}
                        className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-3.5 mr-1" />
                        Waiver Info
                      </Button>
                    ) : item.status === "pending_verification" ? (
                      <span className="text-[11px] text-muted-foreground">
                        Transfer pending · Still payable
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {filteredObligations.length === 0 ? (
            "Showing 0 records"
          ) : (
            <>
              Showing <strong>{first + 1}–{first + pageRows.length}</strong> of{" "}
              {filteredObligations.length}
            </>
          )}
        </span>
        <nav aria-label="Obligations table pages" className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span aria-live="polite">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={page === pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      </div>

      {/* Modal Dialog for Waiver Attribution Details */}
      {inspectingWaiver && (
        <Dialog
          open={Boolean(inspectingWaiver)}
          onOpenChange={(open) => {
            if (!open) setInspectingWaiver(null);
          }}
        >
          <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-emerald-600" />
                Official Council Waiver
              </DialogTitle>
              <DialogDescription>
                This obligation was officially waived by the Student Council.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                <div className="text-xs text-muted-foreground">Obligation</div>
                <div className="font-semibold text-foreground">
                  {inspectingWaiver.description}
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  Original Amount: {formatPhp(inspectingWaiver.amount)}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Waiver Date
                </div>
                <div className="text-foreground">
                  {inspectingWaiver.waived_at
                    ? formatPhDate(inspectingWaiver.waived_at)
                    : "Recorded"}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Reason for Waiver
                </div>
                <div className="rounded-lg border border-border bg-background p-2.5 text-xs text-foreground italic">
                  &ldquo;{inspectingWaiver.waiver_reason || "Approved council waiver."}&rdquo;
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
