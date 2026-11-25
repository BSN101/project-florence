"use client";

import { useId, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleAlert, Loader2, RotateCcw } from "lucide-react";

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
import { cn } from "@/lib/utils";

import { decideMeritEndorsementAction } from "../actions";
import { getTodayManila, meritExpiryDate } from "../calculations";
import { formatManilaDate } from "@/lib/manila-date";
import type { FacultyMeritEndorsementRecord, MeritEndorsementDecision } from "../contracts";
import { decideMeritEndorsementSchema } from "../schemas";

/**
 * Parameterized confirmation dialog for deciding an assigned Council merit endorsement (FL-032).
 * Enforces once-only approval/rejection semantics, keeps rejection reason optional (up to 500 chars),
 * locks the payload during retryable transport failures, and calls `router.refresh()` when
 * dismissed from `retryableError` in case a dropped response committed on the server.
 */
export function EndorsementDecisionDialog({
  decision,
  endorsement,
  semesterLabel,
  isCurrentSemester,
}: {
  decision: MeritEndorsementDecision;
  endorsement: FacultyMeritEndorsementRecord;
  semesterLabel: string;
  isCurrentSemester: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
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
    if (locked || retryableError) {
      setLocked(false);
      setRetryableError(false);
    }
  }

  if (!endorsement.canDecide || endorsement.status !== "pending") {
    return null;
  }

  const isApprove = decision === "approved";
  // Worked out per render, not at page render, so a page left open past Manila midnight shows the date the database will store.
  const todayManila = getTodayManila();
  const expiresOnManila = meritExpiryDate(todayManila);
  const studentName = endorsement.student_name ?? "Student";
  const daysLabel = `${endorsement.requested_days} ${endorsement.requested_days === 1 ? "day" : "days"}`;

  function startOver() {
    setLocked(false);
    setError(null);
    setRetryableError(false);
    setRequestKey(crypto.randomUUID());
  }

  function resetAll() {
    setReason("");
    startOver();
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (locked && !retryableError) return;

    const parsed = decideMeritEndorsementSchema.safeParse({
      requestKey,
      endorsementId: endorsement.id,
      decision,
      reason: isApprove ? null : reason,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the endorsement decision details.");
      return;
    }

    setError(null);
    setLocked(true);

    startTransition(async () => {
      try {
        const res = await decideMeritEndorsementAction(parsed.data);

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
          "Unable to reach the server. If the decision was recorded, clicking retry will safely return the result."
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
          isApprove ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Approve
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Reject
            </Button>
          )
        }
      />

      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "Approve merit endorsement" : "Reject merit endorsement"}
          </DialogTitle>
          <DialogDescription>
            {studentName}
            {endorsement.student_university_id ? ` (${endorsement.student_university_id})` : ""} ·{" "}
            {daysLabel} · {semesterLabel}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1" noValidate>
          {error && (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Endorsement Basis Summary */}
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div className="font-medium text-foreground">Endorsement basis</div>
            <p className="whitespace-normal break-words leading-relaxed text-muted-foreground">
              {endorsement.description}
            </p>
          </div>

          {/* Irreversible Decision Callout */}
          {isApprove ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-50/50 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-medium">One-time merit award creation</div>
                <p className="leading-relaxed text-emerald-900/90">
                  Approving permanently creates{" "}
                  <strong className="font-medium">{daysLabel} of spendable merit</strong> for{" "}
                  {studentName} dated today ({formatManilaDate(todayManila)}), valid for 1 year until{" "}
                  {formatManilaDate(expiresOnManila)}, under {semesterLabel}, and sends an automatic{" "}
                  <span className="font-medium">Merit Endorsed</span> notice. This cannot be undone
                  or approved again.
                </p>
                {!isCurrentSemester && (
                  <p className="leading-relaxed text-emerald-900/90">
                    Although this endorsement belongs to a past semester, awarded units take
                    today&apos;s award date and 1-year validity while keeping their original semester
                    attribution.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-50/50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-medium">One-way endorsement rejection</div>
                <p className="leading-relaxed text-amber-900/90">
                  Rejecting permanently closes this endorsement with zero merit units created and no
                  student notification sent. The outcome and any note below are visible to the student,
                  Council and coordinators, and cannot be undone.
                </p>
              </div>
            </div>
          )}

          {/* Optional Rejection Reason */}
          {!isApprove && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={reasonId} className="block text-sm font-medium text-foreground">
                  Reason for rejection (optional)
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
                placeholder="Optionally explain why this endorsement is being rejected (visible to the student)..."
                className={cn(
                  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                  (isPending || locked) && "cursor-not-allowed opacity-75"
                )}
              />
              <p id={helpId} className="text-xs text-muted-foreground">
                Optional, up to 500 characters. Leave blank to record the rejection without a note.
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
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
                  className="max-sm:min-h-11"
                >
                  Start over
                </Button>
                <Button
                  type="button"
                  variant={isApprove ? "default" : "destructive"}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleSubmit()}
                  className="gap-2 max-sm:min-h-11"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Retrying...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />{" "}
                      {isApprove ? "Retry approval" : "Retry rejection"}
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
                      className="max-sm:min-h-11"
                    >
                      Cancel
                    </Button>
                  }
                />
                <Button
                  type="submit"
                  variant={isApprove ? "default" : "destructive"}
                  size="sm"
                  disabled={locked || isPending}
                  className="gap-2 max-sm:min-h-11"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />{" "}
                      {isApprove ? "Approving..." : "Rejecting..."}
                    </>
                  ) : isApprove ? (
                    "Approve endorsement"
                  ) : (
                    "Reject endorsement"
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
