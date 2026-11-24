"use client";

import { useId, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { waiveObligation } from "../actions";
import { formatPhp } from "../calculations";
import { UNCONFIRMED_COMMAND_MESSAGE, type ObligationWithStandingDTO } from "../contracts";

/**
 * Waive an unpaid fee or fine obligation with attributable reason (FL-026 / T-037).
 * Changes what is owed, never money already received, and covers the agreed cancellation use case.
 */
export function WaiveObligationDialog({
  obligation,
  student,
  onClose,
}: {
  obligation: ObligationWithStandingDTO;
  student: { id: string; universityId: string | null; fullName: string };
  onClose: () => void;
}) {
  const reasonId = useId();

  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountLabel = formatPhp(Number(obligation.amount));
  const categoryLabel =
    obligation.kind === "fee"
      ? "Fee"
      : `Fine${obligation.consequence_outcome ? ` · ${obligation.consequence_outcome}` : ""}`;
  const trimmedReason = reason.trim();

  // Any edit starts a new attempt; unchanged retries replay with the same key so they stay safe.
  function editReason(next: string) {
    setError(null);
    setRequestKey(null);
    setReason(next);
  }

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!trimmedReason) {
      setError("Enter the reason for the waiver.");
      return;
    }

    const key = requestKey ?? crypto.randomUUID();
    if (!requestKey) setRequestKey(key);

    startTransition(async () => {
      const res = await waiveObligation({
        obligationId: obligation.id,
        reason: trimmedReason,
        requestKey: key,
      }).catch(() => null);

      // A failed call to the server may still have committed, so keep the key and replay it.
      if (!res) return setError(UNCONFIRMED_COMMAND_MESSAGE);
      if (!res.success) {
        setError(res.error);
        if (res.issues || res.retryWithNewKey) setRequestKey(null);
        return;
      }

      setDoneMessage(res.message);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto p-5 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <span>{doneMessage ? "Obligation waived" : "Waive unpaid obligation"}</span>
          </DialogTitle>
          <DialogDescription>
            {student.fullName}
            {student.universityId ? ` · ${student.universityId}` : ""} · {amountLabel}
          </DialogDescription>
        </DialogHeader>

        {doneMessage ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
              <CheckCircle2 className="size-8 text-emerald-600" />
              <p className="text-sm font-medium text-foreground">{doneMessage}</p>
              <p className="text-xs text-muted-foreground">
                {obligation.description} ({amountLabel}) has been removed from the student&apos;s payable balance.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleClose} className="min-h-11">
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
            <section
              aria-label="Obligation details"
              className="space-y-3 rounded-xl border border-border bg-card p-4"
            >
              <dl className="space-y-2 text-sm">
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">Obligation</dt>
                  <dd className="min-w-0 break-words font-medium text-foreground">
                    {obligation.description}
                  </dd>
                </div>
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">Category</dt>
                  <dd className="text-xs uppercase tracking-wide text-foreground">
                    {categoryLabel}
                  </dd>
                </div>
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">Term</dt>
                  <dd className="text-xs text-foreground">
                    {obligation.semester_code || "—"}
                  </dd>
                </div>
              </dl>

              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-sm font-medium text-foreground">Amount to waive</span>
                <span className="font-heading text-xl font-semibold tabular-nums text-foreground">
                  {amountLabel}
                </span>
              </div>
            </section>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={reasonId} className="block text-sm font-medium text-foreground">
                  Reason for waiver
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
                disabled={isPending}
                onChange={(e) => editReason(e.target.value)}
                placeholder="State why this unpaid obligation is being waived or cancelled…"
                className={cn(
                  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                  isPending && "cursor-not-allowed opacity-75"
                )}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Waiving removes what is owed (including obligation cancellations) and does not change money already received. This action is attributed to your account and cannot be undone.
              </p>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
                className="min-h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !trimmedReason}
                className="min-h-11"
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isPending ? "Waiving…" : "Waive obligation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
