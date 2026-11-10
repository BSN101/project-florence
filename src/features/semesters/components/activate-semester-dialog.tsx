"use client";

import { useActionState, useState } from "react";
import { ArrowDown, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { activateSemesterAction } from "../actions";
import type { SemesterActionResult, SemesterListItem } from "../contracts";

export function ActivateSemesterDialog({
  semester,
  currentSemester,
  fullWidth = false,
}: {
  semester: SemesterListItem;
  currentSemester?: SemesterListItem | null;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (prev: SemesterActionResult | null, formData: FormData) => {
      const result = await activateSemesterAction(prev, formData);
      if (result.success) {
        setOpen(false);
      }
      return result;
    },
    null,
  );

  const ayLabel = `AY ${semester.academic_year_start}–${semester.academic_year_start + 1}`;
  const currentAyLabel = currentSemester
    ? `AY ${currentSemester.academic_year_start}–${currentSemester.academic_year_start + 1}`
    : null;

  const isEarlierAcademicPeriod =
    currentSemester &&
    (semester.academic_year_start < currentSemester.academic_year_start ||
      (semester.academic_year_start === currentSemester.academic_year_start &&
        semester.starts_on < currentSemester.starts_on));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 font-medium ${fullWidth ? "w-full justify-center" : ""}`}
          >
            <CheckCircle2 className="size-3.5 text-primary" />
            Set as Active
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            Activate {semester.term}?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Review the transition before confirming the institutional academic context switch.
          </DialogDescription>
        </DialogHeader>

        {/* From -> To Transition Comparison */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:p-3.5">
          {/* Current active */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {currentSemester ? currentSemester.term : "None"}{" "}
              {currentAyLabel && (
                <span className="whitespace-nowrap text-muted-foreground">({currentAyLabel})</span>
              )}
            </span>
            {currentSemester ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                Active
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                None active
              </span>
            )}
          </div>

          {/* Direction indicator */}
          <div className="flex items-center justify-center py-0.5 text-muted-foreground">
            <ArrowDown className="size-4 stroke-[2.2]" />
          </div>

          {/* Target will be active */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
            <span className="min-w-0 truncate text-xs font-semibold text-foreground">
              {semester.term}{" "}
              <span className="whitespace-nowrap font-normal text-muted-foreground">({ayLabel})</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Will be active
            </span>
          </div>
        </div>

        {/* Warning if switching to earlier academic period */}
        {isEarlierAcademicPeriod && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-200">
            <TriangleAlert className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <span className="font-medium">
              This semester belongs to an earlier academic period than the currently active one.
            </span>
          </div>
        )}

        {/* Structured "What will change" copy */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3.5 text-xs">
          <h4 className="font-heading font-semibold text-foreground">What will change</h4>
          <ul className="flex flex-col gap-1.5 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <strong className="font-medium text-foreground">New records</strong> (academic, financial, and disciplinary) will be attributed to {semester.term}.
              </span>
            </li>
            {currentSemester && (
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span>
                  <strong className="font-medium text-foreground">{currentSemester.term}</strong> will transition to inactive.
                </span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <span>
                <strong className="font-medium text-foreground">Existing records</strong> retain their original semester attribution.
              </span>
            </li>
          </ul>
          <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            You can switch the active semester context at any time.
          </p>
        </div>

        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-error-surface p-3 text-xs text-foreground"
          >
            {state.error}
          </div>
        )}

        <form action={formAction}>
          <input type="hidden" name="semester_id" value={semester.id} />
          <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              autoFocus
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full gap-2 bg-primary font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Activate {semester.term}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
