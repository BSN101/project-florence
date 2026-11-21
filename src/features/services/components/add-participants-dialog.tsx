"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2, RotateCcw, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { displayName } from "@/lib/format-name";
import { cn } from "@/lib/utils";

import { setServiceParticipantsAction } from "../actions";
import type { AvailableServiceStudent } from "../contracts";

export function AddParticipantsDialog({
  sessionId,
  availableStudents,
  disabled = false,
  triggerLabel = "Add participants",
}: {
  sessionId: string;
  availableStudents: AvailableServiceStudent[];
  disabled?: boolean;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Idempotency and error state
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [retryableError, setRetryableError] = useState(false);

  const searchInputId = useId();
  const yearFilterId = useId();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableStudents.filter((s) => {
      if (selectedYear !== "all" && String(s.year_level) !== selectedYear) {
        return false;
      }
      if (!q) return true;
      const fullName = displayName(s).toLowerCase();
      const num = s.university_id.toLowerCase();
      return fullName.includes(q) || num.includes(q);
    });
  }, [availableStudents, searchQuery, selectedYear]);

  function startOver() {
    setLocked(false);
    setError(null);
    setRetryableError(false);
    setRequestKey(crypto.randomUUID());
  }

  function toggleStudent(id: string) {
    if (locked) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    if (locked) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of filtered) next.add(s.student_id);
      return next;
    });
  }

  function clearSelection() {
    if (locked) return;
    setSelectedIds(new Set());
  }

  function handleAdd() {
    if (selectedIds.size === 0 || (locked && !retryableError)) return;

    setError(null);
    setLocked(true);

    const rows = [...selectedIds].map((id) => ({
      studentId: id,
      timeIn: null,
      timeOut: null,
      excluded: false,
    }));

    startTransition(async () => {
      try {
        const res = await setServiceParticipantsAction({
          requestKey,
          sessionId,
          rows,
        });

        if (res && !res.success) {
          if (res.retryable) {
            setRetryableError(true);
            setError(res.error);
          } else {
            setLocked(false);
            setRetryableError(false);
            setRequestKey(crypto.randomUUID());
            setError(res.error);
            router.refresh();
          }
          return;
        }

        // On success: close dialog and refresh roster
        setOpen(false);
        setSelectedIds(new Set());
        setSearchQuery("");
        setSelectedYear("all");
        setLocked(false);
        setRetryableError(false);
        setRequestKey(crypto.randomUUID());
        router.refresh();
      } catch (err) {
        if (
          err instanceof Error &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        setRetryableError(true);
        setError("Unable to reach the server. If students were added, clicking retry will not duplicate them.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!locked || retryableError) {
          setOpen(next);
          if (!next) {
            if (retryableError) {
              startOver();
            } else {
              setError(null);
            }
          }
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="default"
            size="sm"
            disabled={disabled}
            className="max-sm:min-h-11 gap-1.5"
          >
            <UserPlus className="size-4" />
            <span>{triggerLabel}</span>
          </Button>
        }
      />

      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Add session participants</DialogTitle>
          <DialogDescription>
            Select enrolled students to assign to this service duty session. Attendance can be recorded immediately after adding.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id={searchInputId}
              type="text"
              placeholder="Search by name or student number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={locked}
              className="pl-8 max-sm:min-h-11"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={yearFilterId} className="sr-only">
              Filter by year level
            </label>
            <select
              id={yearFilterId}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={locked}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-11 dark:bg-input/30"
            >
              <option value="all">All Year Levels</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>
        </div>

        {/* Selection Bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
          <span>
            Showing {filtered.length} eligible student{filtered.length === 1 ? "" : "s"}
            {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={locked || filtered.length === 0}
              className="text-primary hover:underline font-medium disabled:opacity-50"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={locked || selectedIds.size === 0}
              className="text-muted-foreground hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Student Picker List */}
        <div className="flex-1 overflow-y-auto border rounded-lg divide-y max-h-72">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {availableStudents.length === 0
                ? "All eligible students in this semester are already assigned to this session."
                : "No students match your search filter."}
            </div>
          ) : (
            filtered.map((student) => {
              const isSelected = selectedIds.has(student.student_id);
              return (
                <label
                  key={student.student_id}
                  className={cn(
                    "flex items-center justify-between p-3 text-xs cursor-pointer select-none max-sm:min-h-11",
                    isSelected
                      ? "bg-primary/5 text-foreground"
                      : "hover:bg-muted/50 text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={locked}
                      onChange={() => toggleStudent(student.student_id)}
                      className="size-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{displayName(student)}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {student.university_id}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                      {student.year_level ? `Yr ${student.year_level}` : "—"}
                    </span>
                    {isSelected && (
                      <Check className="size-3.5 text-primary" aria-hidden="true" />
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-2">
          {retryableError ? (
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startOver}
                className="max-sm:min-h-11"
              >
                Start over
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={handleAdd}
                className="max-sm:min-h-11 gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Retrying...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" /> Retry adding
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-end gap-2">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    className="max-sm:min-h-11"
                  >
                    Cancel
                  </Button>
                }
              />
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.size === 0 || locked || isPending}
                onClick={handleAdd}
                className="max-sm:min-h-11 gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Adding...
                  </>
                ) : (
                  `Add selected (${selectedIds.size})`
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
