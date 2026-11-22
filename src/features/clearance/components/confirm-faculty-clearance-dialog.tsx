"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmFacultyClearanceAction } from "../actions";
import type { FacultyClearanceCandidate, FacultyClearanceComponent } from "../contracts";

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

  const componentLabel = component === "academic" ? "Academic" : "RLE";
  const bucketLabel = candidate.bucket === "office" ? "Office" : "RLE";
  const hasDebt = candidate.netBalance > 0;

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
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="font-heading text-lg font-medium text-foreground flex items-center gap-2">
            <CheckCircle2 className="size-4.5 text-primary" />
            Confirm {componentLabel} Clearance?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Review student status, Council prerequisite, and disciplinary balances before confirming permanent clearance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {error}
            </div>
          )}

          {/* Student Context Card */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:p-3.5">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
              <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                {candidate.name}{" "}
                <span className="font-mono font-normal text-muted-foreground">
                  ({candidate.studentNumber})
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Year {candidate.yearLevel} • <span className="capitalize">{candidate.academicStatus}</span>
              </span>
            </div>

            {/* Prerequisite & Discipline Overview */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="flex flex-col rounded-lg border border-border/60 bg-muted/30 p-2">
                <span className="text-[11px] text-muted-foreground">Council Clearance</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {candidate.councilConfirmedAt
                    ? `Cleared (${confirmedFormat.format(new Date(candidate.councilConfirmedAt))})`
                    : "Confirmed"}
                </span>
              </div>
              <div className="flex flex-col rounded-lg border border-border/60 bg-muted/30 p-2">
                <span className="text-[11px] text-muted-foreground">{bucketLabel} Bucket Balance</span>
                <span className={hasDebt ? "font-semibold text-amber-600 dark:text-amber-400" : "font-medium text-foreground"}>
                  {candidate.netBalance > 0 ? `${candidate.netBalance} day(s) debt` : "Clear (0 days)"}
                </span>
              </div>
            </div>
          </div>

          {/* Advisory Warning if Student Has Disciplinary Debt */}
          {hasDebt && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-amber-900 dark:text-amber-300">
                  Non-Zero Disciplinary Balance
                </span>
                <span className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  This student has <strong>{candidate.netBalance} unserved day(s)</strong> in the {bucketLabel} bucket
                  ({candidate.activeDemerits} active demerits, {candidate.appliedMerits} applied merits, {candidate.serviceCredits} service credits).
                  Faculty clearance may still be granted at coordinator discretion; disciplinary obligations remain on record.
                </span>
              </div>
            </div>
          )}

          {/* Permanent Invariant Notice */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 p-3.5 text-xs">
            <div className="flex items-center gap-1.5 font-heading font-semibold text-foreground">
              <ShieldAlert className="size-3.5 text-primary" />
              <h4>Permanent record</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {componentLabel} clearance is <strong>permanent</strong>. Once confirmed, it cannot be undone or withdrawn.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
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
