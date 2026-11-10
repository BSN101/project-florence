"use client";

import { useActionState, useState } from "react";
import { Plus, Loader2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSemesterAction } from "../actions";
import type { SemesterActionResult } from "../contracts";
import { APPROVED_SEMESTER_TERMS, type SemesterTerm } from "../schemas";

export function CreateSemesterDialog() {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear.toString());
  const [term, setTerm] = useState<SemesterTerm>("1st Semester");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const [state, formAction, isPending] = useActionState(
    async (prev: SemesterActionResult | null, formData: FormData) => {
      const result = await createSemesterAction(prev, formData);
      if (result.success) {
        setOpen(false);
        setStartsOn("");
        setEndsOn("");
      }
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="gap-2 font-medium">
            <Plus className="size-4" />
            New Semester
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Semester</DialogTitle>
          <DialogDescription>
            Add a new semester record. Creating a semester does not activate it automatically.
          </DialogDescription>
        </DialogHeader>

        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-error-surface p-3 text-sm text-foreground"
          >
            {state.error}
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="academic_year_start" className="text-xs font-medium text-foreground">
              Academic Year Start
            </label>
            <Input
              id="academic_year_start"
              name="academic_year_start"
              type="number"
              min={1900}
              max={9998}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2026"
              required
            />
            <p className="text-xs text-muted-foreground">
              For AY {year || "YYYY"}–{year ? Number(year) + 1 : "YYYY"}, enter {year || "the starting year"}.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="term-select" className="text-xs font-medium text-foreground">
              Semester Term
            </label>
            <input type="hidden" name="term" value={term} />
            <Select value={term} onValueChange={(val) => setTerm(val as SemesterTerm)}>
              <SelectTrigger id="term-select" className="w-full">
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {APPROVED_SEMESTER_TERMS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="starts_on" className="text-xs font-medium text-foreground">
                Start Date
              </label>
              <Input
                id="starts_on"
                name="starts_on"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ends_on" className="text-xs font-medium text-foreground">
                End Date
              </label>
              <Input
                id="ends_on"
                name="ends_on"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                min={startsOn || undefined}
                required
              />
            </div>
          </div>

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
              Create Semester
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
