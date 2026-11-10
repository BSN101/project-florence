"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

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
}: {
  semester: SemesterListItem;
  currentSemester?: SemesterListItem | null;
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 font-medium">
            <CheckCircle2 className="size-3.5 text-primary" />
            Set as Active
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-3">
          <DialogTitle>Set as Active Semester</DialogTitle>

          {/* Current context badge */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Currently active:</span>
            {currentSemester ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/20 px-2.5 py-0.5 font-medium text-success-foreground">
                <span className="size-1.5 rounded-full bg-current" />
                {currentSemester.term} ({currentAyLabel})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
                None (No active semester)
              </span>
            )}
          </div>

          <DialogDescription className="text-foreground">
            Are you sure you want to activate{" "}
            <span className="font-semibold text-primary">{semester.term} ({ayLabel})</span>?
          </DialogDescription>
        </DialogHeader>

        {/* Consequence warning callout */}
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/20 p-3.5 text-xs text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold text-warning-foreground">Consequential Action</p>
            <p className="text-muted-foreground">
              Activating this semester will make it the active academic context across Project Florence.
              Ordinary new academic, financial, and disciplinary records will be attributed to this semester.
            </p>
            <p className="text-muted-foreground">
              {currentSemester
                ? `The previously active semester (${currentSemester.term}, ${currentAyLabel}) will transition to inactive. Existing records retain their original semester attribution.`
                : "Existing records retain their original semester attribution."}
            </p>
          </div>
        </div>

        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-error-surface p-3 text-sm text-foreground"
          >
            {state.error}
          </div>
        )}

        <form action={formAction}>
          <input type="hidden" name="semester_id" value={semester.id} />
          <DialogFooter className="mt-4 flex-row justify-end gap-2 sm:gap-2">
            <Button
              type="button"
              variant="default"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="gap-2 border border-warning-foreground/30 bg-warning font-medium text-warning-foreground hover:bg-warning/80"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Confirm Activation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
