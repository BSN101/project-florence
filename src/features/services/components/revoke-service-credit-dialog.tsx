"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { displayName } from "@/lib/format-name";
import { cn } from "@/lib/utils";

import { revokeServiceCreditAction } from "../actions";
import { formatDutyDate } from "../calculations";
import type { ServiceParticipantDetail, ServiceSessionRecord } from "../contracts";
import { revokeServiceCreditSchema } from "../schemas";

/**
 * Issuer-only confirmation dialog for revoking an erroneous service credit (FL-039).
 * Names both the student and the service session per DESIGN.md §3, enforces a 3–500 character
 * reason, locks the reason payload during retryable transport failures, and preserves the
 * idempotency requestKey until the command settles or the user clicks "Start over".
 */
export function RevokeServiceCreditDialog({
  session,
  participant,
}: {
  session: Pick<ServiceSessionRecord, "bucket" | "duty_on" | "location">;
  participant: ServiceParticipantDetail;
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

  const credit = participant.credit;
  if (!credit || credit.revoked_at !== null) {
    return null;
  }

  const creditId = credit.id;
  const studentName = displayName(participant);
  const trackLabel = session.bucket === "office" ? "Office" : "RLE";
  const trimmedReason = reason.trim();

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

  function handleRevoke(event?: React.FormEvent) {
    event?.preventDefault();
    if (locked && !retryableError) return;

    const parsed = revokeServiceCreditSchema.safeParse({
      requestKey,
      creditId,
      reason,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Enter a valid revocation reason (3 to 500 characters)."
      );
      return;
    }

    setError(null);
    setLocked(true);

    startTransition(async () => {
      try {
        const res = await revokeServiceCreditAction(parsed.data);

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

        // On success: close dialog, reset state, and refresh detail view
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
          "Unable to reach the server. If the revocation was recorded, clicking retry will safely return the result."
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
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive max-sm:min-h-11"
          >
            Revoke credit
          </Button>
        }
      />

      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revoke service credit</DialogTitle>
          <DialogDescription>
            {studentName} ({participant.university_id}) · {trackLabel} duty ·{" "}
            {formatDutyDate(session.duty_on)} ·{" "}
            {session.location?.trim() || "No location specified"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleRevoke} className="space-y-4 pt-1" noValidate>
          {error && (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Revocation Policy Callout */}
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-600/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <div className="space-y-1">
              <div className="font-semibold">One-way credit revocation</div>
              <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Revoking removes the <strong className="font-semibold">1-day service credit offset</strong>{" "}
                from {studentName}&apos;s cumulative {trackLabel} duty balance while preserving their
                completed session attendance record. This action cannot be undone or automatically
                regenerated, and it does not reverse any already-confirmed semester clearance.
              </p>
            </div>
          </div>

          {/* Reason Textarea */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor={reasonId}
                className="block text-sm font-medium text-foreground"
              >
                Reason for revocation <span className="text-destructive">*</span>
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
              placeholder="State why this service credit is being revoked (e.g., recorded against wrong student or erroneous duty verification)..."
              className={cn(
                "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                (isPending || locked) && "cursor-not-allowed opacity-75"
              )}
              required
            />
            <p id={helpId} className="text-xs text-muted-foreground">
              Required (3 to 500 characters). The reason is permanently recorded on the student&apos;s
              disciplinary ledger and visible to coordinators.
            </p>
          </div>

          <DialogFooter className="pt-2">
            {retryableError ? (
              <div className="flex w-full items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startOver}
                  disabled={isPending}
                  className="max-sm:min-h-11"
                >
                  Start over
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleRevoke()}
                  className="max-sm:min-h-11 gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Retrying...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" /> Retry revocation
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
                  variant="destructive"
                  size="sm"
                  disabled={locked || isPending || trimmedReason.length < 3}
                  className="max-sm:min-h-11 gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Revoking...
                    </>
                  ) : (
                    "Revoke credit"
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
