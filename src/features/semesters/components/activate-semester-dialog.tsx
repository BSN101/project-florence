"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

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

export function ActivateSemesterDialog({ semester }: { semester: SemesterListItem }) {
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
        <DialogHeader>
          <DialogTitle>Set as Active Semester</DialogTitle>
          <DialogDescription>
            Are you sure you want to activate <span className="font-semibold text-foreground">{semester.term} ({ayLabel})</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          <p>
            Activating this semester will make it the current academic context across Project Florence.
            Ordinary new academic, financial, and disciplinary records will be attributed to this semester.
          </p>
          <p className="mt-2 text-xs">
            Any currently active semester will transition to inactive. Existing records retain their original semester attribution.
          </p>
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
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Confirm Activation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
