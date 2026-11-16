"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Award, Check, Loader2, Plus, Search, X } from "lucide-react";
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
import { sortName } from "@/lib/format-name";
import type { StudentRosterItem } from "@/features/students/contracts";
import { awardDirectMeritsAction } from "../actions";

export function AwardMeritsDialog({
  students,
  semester,
  isActiveSemester,
  actorId,
  todayManila,
}: {
  students: StudentRosterItem[];
  semester?: { id: string; academic_year_start: number; term: string; starts_on: string; ends_on: string } | null;
  isActiveSemester: boolean;
  actorId: string;
  todayManila: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Client-side idempotency key regenerated on open or after success (Refinement 1)
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  const [search, setSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [days, setDays] = useState(1);
  const [awardedOn, setAwardedOn] = useState(todayManila);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const searchInputId = useId();
  const daysInputId = useId();
  const awardedOnInputId = useId();
  const descriptionInputId = useId();

  // Exclude current instructor from student candidates to prevent self-selection upfront
  const eligibleStudents = useMemo(() => {
    return students.filter((s) => s.student_id !== actorId);
  }, [students, actorId]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleStudents;
    return eligibleStudents.filter((s) => {
      const name = sortName(s).toLowerCase();
      const num = s.university_id.toLowerCase();
      return name.includes(q) || num.includes(q);
    });
  }, [eligibleStudents, search]);

  const selectedStudents = useMemo(() => {
    const idSet = new Set(selectedStudentIds);
    return eligibleStudents.filter((s) => idSet.has(s.student_id));
  }, [eligibleStudents, selectedStudentIds]);

  function resetForm() {
    setSearch("");
    setSelectedStudentIds([]);
    setDays(1);
    setAwardedOn(todayManila);
    setDescription("");
    setError(null);
    setSubmissionKey(crypto.randomUUID());
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      resetForm();
    } else {
      setSubmissionKey(crypto.randomUUID());
      setAwardedOn(todayManila);
    }
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  }

  function removeStudent(studentId: string) {
    setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selectedStudentIds.length === 0) {
      setError("Please select at least one student.");
      return;
    }

    if (!description.trim() || description.trim().length < 3) {
      setError("Description must be at least 3 characters.");
      return;
    }

    if (days < 1 || days > 30) {
      setError("Days must be between 1 and 30.");
      return;
    }

    startTransition(async () => {
      const result = await awardDirectMeritsAction({
        submissionKey,
        studentIds: selectedStudentIds,
        days,
        awardedOn,
        description: description.trim(),
      });

      if (!result.success) {
        setError(result.error);
      } else {
        setOpen(false);
        resetForm();
      }
    });
  }

  // Refinement 2: Active semester guard with clear notice when disabled
  if (!isActiveSemester || !semester) {
    return (
      <Button
        disabled
        variant="default"
        size="sm"
        title="Direct merits can only be awarded within the currently active semester."
        className="gap-2 font-medium"
      >
        <Plus className="size-4" />
        <span>Award Merits</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" className="gap-2 font-medium">
            <Plus className="size-4" />
            <span>Award Merits</span>
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            Award Direct Merits
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Award whole-day merits to enrolled students for voluntary service or commendation.
            Awards expire 1 year from the award date and are bucket-agnostic until applied.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Student Multi-Select Picker */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={searchInputId} className="text-xs font-semibold text-foreground">
              Recipient Students ({selectedStudentIds.length} selected)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={searchInputId}
                type="search"
                placeholder="Search by student number or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
                disabled={isPending}
              />
            </div>

            {/* Selected Student Pills */}
            {selectedStudents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedStudents.map((s) => (
                  <span
                    key={s.student_id}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground"
                  >
                    <span className="font-mono text-primary text-[10px]">{s.university_id}</span>
                    <span>{sortName(s)}</span>
                    <button
                      type="button"
                      onClick={() => removeStudent(s.student_id)}
                      disabled={isPending}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${sortName(s)}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Student Candidate List */}
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/20 p-1 divide-y divide-border/40">
              {filteredStudents.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  {search ? "No students matching search." : "No enrolled students found."}
                </p>
              ) : (
                filteredStudents.map((s) => {
                  const isSelected = selectedStudentIds.includes(s.student_id);
                  return (
                    <button
                      key={s.student_id}
                      type="button"
                      onClick={() => toggleStudent(s.student_id)}
                      disabled={isPending}
                      className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isSelected
                          ? "bg-primary/15 text-foreground font-medium"
                          : "hover:bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex size-4 items-center justify-center rounded border ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40 bg-background"
                          }`}
                        >
                          {isSelected && <Check className="size-3" />}
                        </div>
                        <span className="font-mono text-[11px] text-primary">{s.university_id}</span>
                        <span className="text-foreground">{sortName(s)}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Year {s.year_level}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Units (Days) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={daysInputId} className="text-xs font-semibold text-foreground">
                Merit Units (Whole Days)
              </label>
              <Input
                id={daysInputId}
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)}
                disabled={isPending}
                className="h-8 text-xs font-mono"
                required
              />
              <span className="text-[11px] text-muted-foreground">
                Each unit equals 1 whole day (1–30 days).
              </span>
            </div>

            {/* Award Date */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={awardedOnInputId} className="text-xs font-semibold text-foreground">
                Award Date (Asia/Manila)
              </label>
              <Input
                id={awardedOnInputId}
                type="date"
                min={semester.starts_on}
                max={todayManila}
                value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)}
                disabled={isPending}
                className="h-8 text-xs font-mono"
                required
              />
              <span className="text-[11px] text-muted-foreground">
                Must be within {semester.starts_on} to today.
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={descriptionInputId} className="text-xs font-semibold text-foreground">
              Basis / Commendation Reason
            </label>
            <textarea
              id={descriptionInputId}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Commendation for voluntary clinical assistance and exemplary student leadership..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isPending || selectedStudentIds.length === 0 || !description.trim()}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Awarding Merits...</span>
                </>
              ) : (
                <>
                  <Award className="size-3.5" />
                  <span>
                    Award to {selectedStudentIds.length}{" "}
                    {selectedStudentIds.length === 1 ? "Student" : "Students"}
                  </span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
