"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Check, CircleAlert, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { cn } from "@/lib/utils";

import { getTodayManila } from "../calculations";
import type { AwardRecipientOption, ExternalCiEntryFailure } from "../contracts";

export type ExternalCiFlowStep = "students" | "details" | "review" | "result";
export type PickedRecipient = { studentId: string; requestKey: string | null };

const STEPS: { id: Exclude<ExternalCiFlowStep, "result">; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];
const MATCH_LIMIT = 20;

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function computeLatestManilaDate(endsOn: string): string {
  const today = getTodayManila();
  return endsOn < today ? endsOn : today;
}

type BatchReconciliation =
  | {
      kind: "pre_rpc_error";
      picked: PickedRecipient[];
      locked: boolean;
      error: string;
    }
  | {
      kind: "result";
      picked: PickedRecipient[];
      locked: boolean;
      hadTransportUncertainty: boolean;
    };

/**
 * Reconciles a multi-recipient submission outcome into the next retry state:
 * - Pre-RPC rejections clear lazy keys only when `!wasLocked`, preserving UUIDs across locked retries.
 * - Clean success clears pending recipients and unlocks.
 * - Partial/full failures drop succeeded AND deterministic non-retryable recipients from the locked
 *   retry queue, preserving `requestKey` strictly for `retryable: true` recipients.
 */
export function reconcileBatchOutcome({
  preparedRecipients,
  success,
  succeededIds,
  failures,
  error,
  wasLocked,
}: {
  preparedRecipients: PickedRecipient[];
  success: boolean;
  succeededIds: string[];
  failures: ExternalCiEntryFailure[];
  error?: string;
  wasLocked: boolean;
}): BatchReconciliation {
  if (!success && succeededIds.length === 0 && failures.length === 0) {
    return {
      kind: "pre_rpc_error",
      picked: wasLocked
        ? preparedRecipients
        : preparedRecipients.map((p) => ({ studentId: p.studentId, requestKey: null })),
      locked: wasLocked,
      error: error ?? "Unable to record these entries. Try again.",
    };
  }

  if (success) {
    return {
      kind: "result",
      picked: [],
      locked: false,
      hadTransportUncertainty: false,
    };
  }

  const retryableIds = new Set(failures.filter((f) => f.retryable).map((f) => f.studentId));
  if (retryableIds.size > 0) {
    return {
      kind: "result",
      picked: preparedRecipients.filter((p) => retryableIds.has(p.studentId)),
      locked: true,
      hadTransportUncertainty: true,
    };
  }

  return {
    kind: "result",
    picked: [],
    locked: false,
    hadTransportUncertainty: false,
  };
}

export function ExternalCiFlowStepper({
  step,
  ariaLabel,
}: {
  step: Exclude<ExternalCiFlowStep, "result">;
  ariaLabel: string;
}) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label={ariaLabel}>
      {STEPS.map((item, index) => (
        <li
          key={item.id}
          aria-current={index === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-2",
            index === current ? "font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full border text-xs tabular-nums",
              index < current
                ? "border-primary bg-primary text-primary-foreground"
                : index === current
                ? "border-primary text-primary"
                : "border-border"
            )}
          >
            {index < current ? <Check className="size-4" aria-hidden="true" /> : index + 1}
          </span>
          {item.label}
          {index < STEPS.length - 1 && (
            <span aria-hidden="true" className="h-px w-6 bg-border" />
          )}
        </li>
      ))}
    </ol>
  );
}

export function ExternalCiStudentPickerStep({
  searchId,
  students,
  picked,
  search,
  onSearchChange,
  onToggle,
  onContinue,
  labelOf,
}: {
  searchId: string;
  students: AwardRecipientOption[];
  picked: PickedRecipient[];
  search: string;
  onSearchChange: (value: string) => void;
  onToggle: (studentId: string) => void;
  onContinue: () => void;
  labelOf: (studentId: string) => string;
}) {
  const pickedIds = useMemo(() => new Set(picked.map((p) => p.studentId)), [picked]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? students.filter(
          (s) =>
            sortName(s).toLowerCase().includes(q) ||
            s.university_id.toLowerCase().includes(q)
        )
      : students;
  }, [students, search]);

  return (
    <Card className="flex w-full flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="text-sm font-medium">
          Find active enrolled students
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name or student number"
            className="h-10 pl-10 max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
          />
        </div>
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected students">
          {picked.map((p) => (
            <span
              key={p.studentId}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 py-1 pl-3 pr-1 text-xs"
            >
              <span>{labelOf(p.studentId)}</span>
              <button
                type="button"
                onClick={() => onToggle(p.studentId)}
                aria-label={`Remove ${labelOf(p.studentId)}`}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <ul className="divide-y divide-border/60 rounded-lg border border-border">
        {matches.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">
            {students.length
              ? "No active students match this search."
              : "No active students are enrolled in the current semester."}
          </li>
        )}
        {matches.slice(0, MATCH_LIMIT).map((s) => {
          const selected = pickedIds.has(s.student_id);
          const studentLabel = `${sortName(s)} · ${s.university_id}`;
          return (
            <li key={s.student_id}>
              <button
                type="button"
                onClick={() => onToggle(s.student_id)}
                aria-pressed={selected}
                aria-label={`${selected ? "Deselect" : "Select"} ${studentLabel}`}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10" : "hover:bg-muted/50"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  )}
                >
                  {selected && <Check className="size-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{sortName(s)}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.university_id}</span>
                <span className="text-xs text-muted-foreground max-sm:hidden">
                  Year {s.year_level}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {matches.length > MATCH_LIMIT && (
        <p className="text-xs text-muted-foreground">
          Showing {MATCH_LIMIT} of {matches.length}. Search by name or number to find others.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onContinue}
          className="max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
        >
          Continue with {plural(picked.length, "student")}
        </Button>
      </div>
    </Card>
  );
}

export function ExternalCiFlowResultCard({
  success,
  succeededIds,
  failures,
  dayCount,
  retryableCount,
  listHref,
  recordMoreLabel,
  labelOf,
  onRetry,
  onStartOver,
}: {
  success: boolean;
  succeededIds: string[];
  failures: ExternalCiEntryFailure[];
  dayCount: number;
  retryableCount: number;
  listHref: string;
  recordMoreLabel: string;
  labelOf: (studentId: string) => string;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  return (
    <Card className="flex w-full flex-col gap-6 p-4 sm:p-6" role="status">
      {succeededIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-medium text-emerald-700">
            <Check className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Recorded {plural(dayCount, "day")} for {plural(succeededIds.length, "student")}
            </span>
          </p>
          <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
            {succeededIds.map((id) => (
              <li key={id} className="px-3 py-2">
                {labelOf(id)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!success && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>Not recorded for {plural(failures.length, "student")}</span>
          </p>
          <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
            {failures.map((f) => (
              <li key={f.studentId} className="flex flex-col gap-1 px-3 py-2">
                <span>{labelOf(f.studentId)}</span>
                <span className="whitespace-normal break-words text-xs text-muted-foreground">
                  {f.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={listHref} />}
          className="max-sm:min-h-11 pointer-coarse:min-h-11"
        >
          View external CI records
        </Button>
        {retryableCount > 0 ? (
          <>
            <Button
              variant="outline"
              onClick={onStartOver}
              className="max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Start over
            </Button>
            <Button
              onClick={onRetry}
              className="max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Retry {plural(retryableCount, "remaining student")}
            </Button>
          </>
        ) : (
          <Button
            onClick={onStartOver}
            className="max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            {success ? recordMoreLabel : "Start over"}
          </Button>
        )}
      </div>
    </Card>
  );
}
