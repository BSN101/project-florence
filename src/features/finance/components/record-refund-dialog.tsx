"use client";

import { useId, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isoToManilaInput, manilaInputToIso } from "@/features/events/schemas";
import { cn } from "@/lib/utils";
import { recordRefund } from "../actions";
import { formatPhDate, formatPhp } from "../calculations";
import { UNCONFIRMED_COMMAND_MESSAGE, type PaymentHistoryDTO } from "../contracts";

/**
 * Record a completed full-payment refund made outside Florence (FL-027 / T-038).
 * Preserves gross received, refund, and net totals without waiving debt;
 * active covered obligations become payable again.
 */
export function RecordRefundDialog({
  payment,
  student,
  onClose,
}: {
  payment: PaymentHistoryDTO;
  student: { id: string; universityId: string | null; fullName: string };
  onClose: () => void;
}) {
  const refundedAtId = useId();
  const reasonId = useId();
  const confirmId = useId();

  const [nowInput] = useState(() => isoToManilaInput(new Date().toISOString()));
  const [refundedAtInput, setRefundedAtInput] = useState(() => nowInput);
  const [reason, setReason] = useState("");
  const [factsConfirmed, setFactsConfirmed] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountLabel = formatPhp(Number(payment.amount));
  const methodLabel = payment.method === "cash" ? "Cash" : "Transfer";
  // The input holds whole minutes, so round up or the offered minimum falls before received_at.
  const minRefundedAtInput = payment.received_at
    ? isoToManilaInput(
        new Date(Math.ceil(Date.parse(payment.received_at) / 60_000) * 60_000).toISOString()
      )
    : undefined;
  const trimmedReason = reason.trim();

  // Any edit starts a new attempt; unchanged retries replay with the same key so they stay safe.
  function edit(update: () => void) {
    setError(null);
    setRequestKey(null);
    update();
  }

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!payment.receipt_id) {
      setError("This payment has no recorded receipt to refund.");
      return;
    }

    const refundedAtIso = manilaInputToIso(refundedAtInput);
    const refundedMs = refundedAtIso ? Date.parse(refundedAtIso) : NaN;
    if (!refundedAtIso || Number.isNaN(refundedMs)) {
      setError("Enter a valid refund date and time.");
      return;
    }
    if (refundedMs > Date.now()) {
      setError("Refund date and time cannot be in the future.");
      return;
    }
    if (payment.received_at && refundedMs < Date.parse(payment.received_at)) {
      setError("The refund date and time cannot be earlier than when the payment was received.");
      return;
    }
    if (!trimmedReason) {
      setError("Enter the reason for the refund.");
      return;
    }
    if (!factsConfirmed) {
      setError("Confirm that the full refund has already been returned.");
      return;
    }

    const key = requestKey ?? crypto.randomUUID();
    if (!requestKey) setRequestKey(key);
    const receiptId = payment.receipt_id;

    startTransition(async () => {
      const res = await recordRefund({
        receiptId,
        refundedAt: refundedAtIso,
        reason: trimmedReason,
        factsConfirmed: true,
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
            <RotateCcw className="size-5 text-destructive" />
            <span>{doneMessage ? "Refund recorded" : "Record completed refund"}</span>
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
              <p className="text-xs leading-relaxed text-muted-foreground">
                The {amountLabel} refund has been recorded while preserving gross received, refund,
                and net totals. Active obligations covered by this payment are payable again.
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
              aria-label="Payment receipt details"
              className="space-y-3 rounded-xl border border-border bg-card p-4"
            >
              <dl className="space-y-2 text-sm">
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">Method</dt>
                  <dd className="text-xs font-medium text-foreground">{methodLabel}</dd>
                </div>
                {payment.method === "transfer" && payment.destination_label && (
                  <div className="grid grid-cols-[6rem_1fr] gap-2">
                    <dt className="text-xs text-muted-foreground">Destination</dt>
                    <dd className="min-w-0 break-words text-xs text-foreground">
                      {payment.destination_label}
                    </dd>
                  </div>
                )}
                {payment.reference_number && (
                  <div className="grid grid-cols-[6rem_1fr] gap-2">
                    <dt className="text-xs text-muted-foreground">Reference</dt>
                    <dd className="min-w-0 break-all font-mono text-xs text-foreground">
                      {payment.reference_number}
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">Received</dt>
                  <dd className="text-xs tabular-nums text-foreground">
                    {formatPhDate(payment.received_at ?? payment.submitted_at)}
                  </dd>
                </div>
                <div className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">Term</dt>
                  <dd className="text-xs text-foreground">{payment.semester_code || "—"}</dd>
                </div>
              </dl>

              {payment.items.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Covered obligations ({payment.items.length})
                  </p>
                  <ul className="space-y-1 text-xs">
                    {payment.items.map((item) => (
                      <li
                        key={item.obligation_id}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span className="min-w-0 break-words text-foreground">
                          {item.description}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatPhp(item.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-sm font-medium text-foreground">Full refund amount</span>
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
              <label
                htmlFor={refundedAtId}
                className="block text-sm font-medium text-foreground"
              >
                Actual refund date &amp; time (Asia/Manila)
              </label>
              <Input
                id={refundedAtId}
                type="datetime-local"
                value={refundedAtInput}
                min={minRefundedAtInput}
                max={nowInput}
                disabled={isPending}
                onChange={(e) => edit(() => setRefundedAtInput(e.target.value))}
                className={cn(
                  "min-h-11 text-base md:text-sm",
                  isPending && "cursor-not-allowed opacity-75"
                )}
              />
              <p className="text-xs text-muted-foreground">
                When the full amount was actually returned. Cannot be earlier than receipt or in
                the future.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={reasonId}
                  className="block text-sm font-medium text-foreground"
                >
                  Reason for refund
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
                onChange={(e) => edit(() => setReason(e.target.value))}
                placeholder="State why this verified payment was refunded in full…"
                className={cn(
                  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                  isPending && "cursor-not-allowed opacity-75"
                )}
              />
            </div>

            <label
              htmlFor={confirmId}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5 text-sm",
                isPending && "cursor-not-allowed opacity-75"
              )}
            >
              <input
                id={confirmId}
                type="checkbox"
                checked={factsConfirmed}
                disabled={isPending}
                onChange={(e) => edit(() => setFactsConfirmed(e.target.checked))}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span className="text-xs leading-relaxed text-foreground">
                I confirm that the full {amountLabel} has already been returned to{" "}
                {student.fullName} outside Florence. Active obligations covered by this payment
                will become payable again and still require a separate waiver to remove debt.
              </span>
            </label>

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
                variant="destructive"
                disabled={isPending || !trimmedReason || !factsConfirmed || !refundedAtInput}
                className="min-h-11"
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isPending ? "Recording…" : "Record refund"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
