"use client";

import { useId, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CircleAlert, Loader2, RotateCcw } from "lucide-react";

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
import { formatManilaDate } from "@/lib/manila-date";
import { cn } from "@/lib/utils";

import { waiveDemeritAction } from "../actions";
import type { WaiveDemeritTarget } from "../contracts";
import { waiveDemeritSchema } from "../schemas";
import { BucketBadge } from "./disciplinary-badges";

/**
 * Shared confirmation dialog for waiving a single demerit unit (FL-034).
 * Reusable across Faculty My entries, Council Conduct, and External CI records (T-047).
 * Enforces a 3-500 character reason, preserves the idempotency requestKey across
 * retryable transport failures, and calls `router.refresh()` on start-over or dismissal
 * from `retryableError` in case a dropped response committed on the server.
 */
export function WaiveDemeritDialog({
  demerit,
  semesterLabel,
  isCurrentSemester,
}: {
  demerit: WaiveDemeritTarget;
  semesterLabel: string;
  isCurrentSemester: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryableError, setRetryableError] = useState(false);

  const reasonId = useId();
  const helpId = useId();
  const errorId = useId();

  // Preserved (hidden) pages keep state under <Activity>: reset transient dialog state when route or semester changes.
  const pathname = usePathname();
  const locationKey = `${pathname}:${semesterLabel}`;
  const [seenLocation, setSeenLocation] = useState(locationKey);
  if (seenLocation !== locationKey && !isPending) {
    setSeenLocation(locationKey);
    if (open) setOpen(false);
    if (error !== null) setError(null);
    if (reason !== "") setReason("");
    if (requestKey !== null) setRequestKey(null);
    if (locked || retryableError) {
      setLocked(false);
      setRetryableError(false);
    }
  }

  const studentName = demerit.student_name ?? "Student";
  const bucketLabel = demerit.bucket === "office" ? "Office" : "RLE";
  const formattedIncidentDate = formatManilaDate(demerit.incident_on);
  const trimmedReason = reason.trim();
  const visibilityAudience =
    demerit.source === "council"
      ? "the student, Council, and coordinators"
      : "the student, coordinators, and you";

  function startOver() {
    setLocked(false);
    setError(null);
    setRetryableError(false);
    setRequestKey(null);
  }

  function resetAll() {
    setReason("");
    startOver();
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (locked && !retryableError) return;

    const nextKey = requestKey ?? crypto.randomUUID();
    const parsed = waiveDemeritSchema.safeParse({
      requestKey: nextKey,
      demeritId: demerit.id,
      reason,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Enter a valid waiver reason (3 to 500 characters)."
      );
      return;
    }

    if (requestKey === null) setRequestKey(nextKey);
    setError(null);
    setLocked(true);

    startTransition(async () => {
      try {
        const res = await waiveDemeritAction(parsed.data);

        if (res && !res.success) {
          if (res.retryable) {
            setRetryableError(true);
            setError(res.error);
          } else {
            setLocked(false);
            setRetryableError(false);
            setRequestKey(null);
            setError(res.error);
            router.refresh();
          }
          return;
        }

        setOpen(false);
        resetAll();
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
        setError(
          "Unable to reach the server. If the waiver was recorded, clicking retry will safely return the result."
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending && (!locked || retryableError)) {
          setOpen(next);
          if (!next) {
            if (retryableError) {
              startOver();
              // The dropped reply may have committed on the server; refresh current state.
              router.refresh();
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
            type="button"
            variant="outline"
            size="xs"
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            Waive
          </Button>
        }
      />

      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Waive demerit unit</DialogTitle>
          <DialogDescription>
            {studentName}
            {demerit.student_university_id ? ` (${demerit.student_university_id})` : ""} ·{" "}
            {bucketLabel} · {formattedIncidentDate}
            {demerit.unitLabel ? ` · ${demerit.unitLabel}` : ""} · {semesterLabel}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1" noValidate>
          {error && (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Demerit Unit Summary */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <BucketBadge bucket={demerit.bucket} />
              <span className="font-medium text-foreground">{formattedIncidentDate}</span>
              {demerit.unitLabel && (
                <span className="text-muted-foreground">· {demerit.unitLabel}</span>
              )}
            </div>
            <p className="whitespace-normal break-words leading-relaxed text-muted-foreground">
              {demerit.description}
            </p>
            {demerit.external_source_name?.trim() && (
              <p className="whitespace-normal break-words text-muted-foreground">
                External source:{" "}
                <span className="font-medium text-foreground">{demerit.external_source_name}</span>
              </p>
            )}
          </div>

          {/* Irreversible Waiver & Balance Guard Callout */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-50/50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-1 size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-2">
              <div className="font-medium">One-way demerit waiver</div>
              <p className="leading-relaxed text-amber-900/90">
                Waiving permanently marks this 1-day unit as{" "}
                <span className="font-medium">Waived</span> and excludes it from{" "}
                {studentName}&apos;s {bucketLabel} balance. This cannot be undone and does not
                change any already-confirmed semester clearance.
              </p>
              <p className="leading-relaxed text-amber-900/90">
                Waivers require a positive cumulative {bucketLabel} balance; if merits or service
                credits already cover the balance, the waiver will be refused.
              </p>
              {!isCurrentSemester && (
                <p className="leading-relaxed text-amber-900/90">
                  Although this entry belongs to {semesterLabel}, waiving it reduces the
                  student&apos;s current cumulative {bucketLabel} balance while keeping{" "}
                  {semesterLabel} attribution.
                </p>
              )}
            </div>
          </div>

          {/* Mandatory Waiver Reason */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={reasonId} className="block text-sm font-medium text-foreground">
                Reason for waiver <span className="text-destructive">*</span>
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {reason.length}/500
              </span>
            </div>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              maxLength={500}
              disabled={isPending || locked}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${errorId} ${helpId}` : helpId}
              onChange={(e) => {
                if (locked) return;
                setError(null);
                setReason(e.target.value);
              }}
              placeholder="Explain why this demerit unit is being waived..."
              className={cn(
                "w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                (isPending || locked) && "cursor-not-allowed opacity-75"
              )}
              required
            />
            <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
              Required (3 to 500 characters). Permanently recorded and visible to{" "}
              {visibilityAudience}.
            </p>
          </div>

          <DialogFooter>
            {retryableError ? (
              <div className="flex w-full items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    startOver();
                    // The dropped reply may have committed on the server; refresh current state.
                    router.refresh();
                  }}
                  disabled={isPending}
                  className="max-sm:min-h-11 pointer-coarse:min-h-11"
                >
                  Start over
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleSubmit()}
                  className="gap-2 max-sm:min-h-11 pointer-coarse:min-h-11"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Retrying...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" /> Retry waiver
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
                      disabled={locked || isPending}
                      className="max-sm:min-h-11 pointer-coarse:min-h-11"
                    >
                      Cancel
                    </Button>
                  }
                />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={locked || isPending || trimmedReason.length < 3}
                  className="gap-2 max-sm:min-h-11 pointer-coarse:min-h-11"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Waiving...
                    </>
                  ) : (
                    "Waive demerit"
                  )}
                </Button>
              </div>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
