"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  RotateCcw,
} from "lucide-react";

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
import { displayName } from "@/lib/format-name";
import { cn } from "@/lib/utils";

import { endServiceSessionAction } from "../actions";
import { extractTimeHHmmManila, isParticipantFinalizationValid } from "../calculations";
import type { FinalizationEligibility, ServiceSessionDetail } from "../contracts";

export function FinalizeSessionDialog({
  session,
  eligibility,
  renderedAt,
}: {
  session: ServiceSessionDetail;
  eligibility: FinalizationEligibility;
  renderedAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Idempotency and error state
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryableError, setRetryableError] = useState(false);

  const blockedReasonId = useId();

  function startOver() {
    setLocked(false);
    setError(null);
    setRetryableError(false);
    setRequestKey(crypto.randomUUID());
  }

  // Derive incomplete included participants to list them clearly if finalization is blocked by attendance
  const incompleteParticipants = useMemo(() => {
    if (eligibility.incompleteCount === 0) return [];
    return session.participants.filter(
      (p) => p.excluded_at === null && !isParticipantFinalizationValid(p, session, renderedAt)
    );
  }, [session, eligibility.incompleteCount, renderedAt]);

  const displayedIncomplete = incompleteParticipants.slice(0, 5);
  const remainingIncompleteCount = incompleteParticipants.length - displayedIncomplete.length;

  function handleFinalize() {
    if (!eligibility.canFinalize || (locked && !retryableError)) return;

    setError(null);
    setLocked(true);

    startTransition(async () => {
      try {
        const res = await endServiceSessionAction({
          requestKey,
          sessionId: session.id,
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

        // On success: close dialog and refresh detail page
        setOpen(false);
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
        setError("Unable to reach the server. If finalization was recorded, clicking retry will safely return the result.");
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
            variant="outline"
            size="sm"
            className="max-sm:min-h-11 gap-1.5"
          >
            <CheckCircle2 className="size-4" />
            <span>End service session</span>
          </Button>
        }
      />

      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>End service session</DialogTitle>
          <DialogDescription>
            Review participant completion and attendance readiness before permanently finalizing this session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Completion Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg border border-border p-2.5 bg-card">
              <div className="text-muted-foreground">Total</div>
              <div className="text-lg font-bold text-foreground">{eligibility.totalCount}</div>
            </div>
            <div className="rounded-lg border border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
              <div className="text-emerald-800 dark:text-emerald-300 font-medium">Ready</div>
              <div className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                {eligibility.completedCount}
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400">On time & late</div>
            </div>
            <div className="rounded-lg border border-stone-300 bg-stone-100/50 dark:border-stone-700 dark:bg-stone-900/30 p-2.5">
              <div className="text-stone-700 dark:text-stone-300 font-medium">Excluded</div>
              <div className="text-lg font-bold text-stone-800 dark:text-stone-200">
                {eligibility.excludedCount}
              </div>
            </div>
            <div
              className={cn(
                "rounded-lg border p-2.5",
                eligibility.incompleteCount > 0
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              <div className="font-medium">Incomplete</div>
              <div
                className={cn(
                  "text-lg font-bold",
                  eligibility.incompleteCount > 0 ? "text-destructive" : "text-foreground"
                )}
              >
                {eligibility.incompleteCount}
              </div>
            </div>
          </div>

          {/* Saved-Attendance Reminder */}
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <strong className="text-foreground font-medium">Reminder:</strong> Finalization evaluates{" "}
              <strong className="text-foreground font-medium">saved</strong> attendance records only.
              Save any unsaved changes in the attendance table before ending this session.
            </span>
          </div>

          {/* Blocking Readiness Callout */}
          {!eligibility.canFinalize && eligibility.reason && (
            <div
              id={blockedReasonId}
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-semibold">Finalization Blocked</div>
                <div>{eligibility.reason}</div>
                {!eligibility.isPastScheduledEnd && (
                  <div className="text-destructive/90">
                    Scheduled duty end time is {extractTimeHHmmManila(session.scheduled_end)}. Refresh after this time has passed.
                  </div>
                )}
                {eligibility.incompleteCount > 0 && incompleteParticipants.length > 0 && (
                  <div className="pt-1">
                    <span className="font-medium">Participants requiring complete attendance or exclusion:</span>
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {displayedIncomplete.map((p) => (
                        <li key={p.student_id}>
                          {displayName(p)} ({p.university_id})
                        </li>
                      ))}
                      {remainingIncompleteCount > 0 && (
                        <li>
                          + {remainingIncompleteCount} more student{remainingIncompleteCount === 1 ? "" : "s"}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Credit and Notification Policy Note */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground">Finalization Policy</div>
            {eligibility.completedCount > 0 ? (
              <p className="text-muted-foreground">
                Finalizing permanently locks this session and its attendance. Each completed student
                (both on time and late) with an outstanding duty debt in the session’s track will receive{" "}
                <strong className="text-foreground">1 whole-day service credit</strong>. Students with zero debt
                retain their completion with 0 credit. Every completed participant will receive a{" "}
                <strong className="text-foreground">Service Recorded</strong> notification.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Ending this session will permanently lock it with 0 completed participants and 0 service credits issued.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4">
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
                variant="default"
                size="sm"
                disabled={isPending}
                onClick={handleFinalize}
                className="max-sm:min-h-11 gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Retrying...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" /> Retry finalizing
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
                variant="default"
                size="sm"
                disabled={!eligibility.canFinalize || locked || isPending}
                aria-describedby={!eligibility.canFinalize ? blockedReasonId : undefined}
                onClick={handleFinalize}
                className="max-sm:min-h-11 gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Finalizing...
                  </>
                ) : (
                  "Confirm & end session"
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
