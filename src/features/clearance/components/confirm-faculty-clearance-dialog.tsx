"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmFacultyClearanceAction } from "../actions";
import {
  FACULTY_CLEARANCE_CONFIG,
  type FacultyClearanceCandidate,
  type FacultyClearanceComponent,
} from "../contracts";

const confirmedFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export function ConfirmFacultyClearanceDialog({
  candidate,
  semesterId,
  component,
  isOpen,
  onClose,
  onSuccess,
}: {
  candidate: FacultyClearanceCandidate | null;
  semesterId: string;
  component: FacultyClearanceComponent;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // One key per opened dialog, keyed to this candidate session so retries replay safely.
  const [requestKey] = useState(() => crypto.randomUUID());

  if (!candidate) return null;

  const config = FACULTY_CLEARANCE_CONFIG[component];
  const componentLabel = config.label;
  const bucketLabel = config.bucketLabel;
  const hasDebt = candidate.netBalance > 0;
  const hasDisciplineHistory =
    candidate.activeDemerits > 0 || candidate.appliedMerits > 0 || candidate.serviceCredits > 0;

  function handleConfirm() {
    if (!candidate) return;
    setError(null);

    startTransition(async () => {
      const result = await confirmFacultyClearanceAction({
        studentId: candidate.studentId,
        semesterId,
        component,
        requestKey,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSuccess?.();
      onClose();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto overflow-x-hidden p-4 sm:p-6 sm:max-w-lg">
        <DialogHeader className="gap-1.5 text-left pb-2 border-b border-border/60 min-w-0 max-w-full pr-8 sm:pr-0">
          <DialogTitle className="font-heading text-base sm:text-lg font-semibold text-foreground flex items-center gap-2 min-w-0">
            <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="size-4 sm:size-4.5" />
            </div>
            <span className="leading-snug break-words">Confirm {componentLabel} Clearance?</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed break-words">
            Review student status, Council prerequisite, and disciplinary balances before confirming permanent clearance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1 min-w-0 max-w-full">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive break-words min-w-0"
            >
              {error}
            </div>
          )}

          {/* Student Context Card */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:p-3.5 min-w-0 max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between items-start gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-2 min-w-0">
              <span className="min-w-0 text-xs font-semibold text-foreground break-words">
                {candidate.name}{" "}
                <span className="font-mono font-normal text-muted-foreground whitespace-nowrap">
                  ({candidate.studentNumber})
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Year {candidate.yearLevel} • <span className="capitalize">{candidate.academicStatus}</span>
              </span>
            </div>

            {/* Prerequisite & Discipline Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 min-w-0">
              <div className="flex flex-col rounded-lg border border-border/60 bg-muted/30 p-2.5 min-w-0">
                <span className="text-[11px] text-muted-foreground">Council Clearance</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400 break-words">
                  {candidate.councilConfirmedAt
                    ? `Cleared (${confirmedFormat.format(new Date(candidate.councilConfirmedAt))})`
                    : "Confirmed"}
                </span>
              </div>
              <div className="flex flex-col rounded-lg border border-border/60 bg-muted/30 p-2.5 min-w-0">
                <span className="text-[11px] text-muted-foreground">{bucketLabel} Bucket Balance</span>
                <span className={cn("break-words", hasDebt ? "font-semibold text-amber-600 dark:text-amber-400" : "font-medium text-foreground")}>
                  {candidate.netBalance > 0
                    ? `${candidate.netBalance} day(s) debt`
                    : hasDisciplineHistory
                    ? "0 days (balanced)"
                    : "0 days"}
                </span>
              </div>
            </div>
          </div>

          {/* Disciplinary Summary (Warning if active debt; Informational if offset/balanced history) */}
          {hasDebt && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4 text-xs text-amber-950 dark:text-amber-200 min-w-0 max-w-full">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="font-semibold text-amber-900 dark:text-amber-300 break-words">
                  Non-Zero Disciplinary Balance
                </span>
                <span className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 break-words">
                  This student has <strong>{candidate.netBalance} unserved day(s)</strong> in the {bucketLabel} bucket
                  ({candidate.activeDemerits} active demerits, {candidate.appliedMerits} applied merits, {candidate.serviceCredits} service credits).
                  Faculty clearance may still be granted at coordinator discretion; disciplinary obligations remain on record.
                </span>
              </div>
            </div>
          )}

          {!hasDebt && hasDisciplineHistory && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-3 sm:p-4 text-xs text-muted-foreground min-w-0 max-w-full">
              <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="font-semibold text-foreground break-words">
                  Satisfied Disciplinary Obligations (Net: 0 days)
                </span>
                <span className="text-[11px] leading-relaxed text-muted-foreground break-words">
                  This student previously had disciplinary records ({candidate.activeDemerits} demerits) that have been offset by {candidate.appliedMerits} applied merits and {candidate.serviceCredits} service credits.
                </span>
              </div>
            </div>
          )}

          {/* Permanent Invariant Notice */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 p-3 sm:p-4 text-xs min-w-0 max-w-full">
            <div className="flex items-center gap-2 font-heading font-semibold text-foreground min-w-0">
              <ShieldAlert className="size-4 shrink-0 text-primary" />
              <h4 className="break-words">Permanent record</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed break-words">
              {componentLabel} clearance is <strong>permanent</strong>. Once confirmed, it cannot be undone or withdrawn.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 min-w-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="w-full max-md:min-h-11 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || candidate.isSelf || !candidate.councilCleared}
            className="w-full gap-2 font-medium max-md:min-h-11 sm:w-auto"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Confirm Clearance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
