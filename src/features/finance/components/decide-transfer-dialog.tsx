"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

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
import { decideTransfer, getTransferProofUrl } from "../actions";
import { formatPhDate, formatPhp } from "../calculations";
import type { PendingTransferReviewDTO } from "../contracts";
import type { TransferDecisionInput } from "../schemas";

type DecisionMode = TransferDecisionInput["mode"];

const MODE_LABELS: Record<DecisionMode, { title: string; hint: string; confirm: (amount: string) => string }> = {
  received: {
    title: "Verify: the money was received",
    hint: "Creates the official receipt and marks the covered obligations paid.",
    confirm: (amount) => `I checked that ${amount} was actually received.`,
  },
  no_receipt: {
    title: "Reject: no money was received",
    hint: "The obligations become payable again. No receipt is created.",
    confirm: () => "I checked that no money was received for this transfer.",
  },
  duplicate: {
    title: "Reject: duplicate of a transfer already recorded",
    hint: "Links this proof to the existing receipt. It adds no second receipt or refund.",
    confirm: () => "I checked that this proof is for a transfer already recorded.",
  },
  returned: {
    title: "Reject: received, then returned outside the platform",
    hint: "Keeps the received money and its return in the receipt and refund records.",
    confirm: (amount) => `I checked that ${amount} was received and fully returned outside the platform.`,
  },
};

type ProofState = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

const MODES: DecisionMode[] = ["received", "no_receipt", "duplicate", "returned"];

/**
 * Verify or reject one pending transfer (FL-025 / T-036). Shows the proof beside the facts the
 * operator must check, then calls decideTransfer. The database re-checks every rule.
 */
export function DecideTransferDialog({
  review,
  onClose,
}: {
  review: PendingTransferReviewDTO;
  onClose: () => void;
}) {
  const receivedAtId = useId();
  const refundedAtId = useId();
  const reasonId = useId();
  const receiptSelectId = useId();
  const confirmId = useId();

  const [mode, setMode] = useState<DecisionMode | null>(null);
  const [receivedAtInput, setReceivedAtInput] = useState("");
  const [refundedAtInput, setRefundedAtInput] = useState("");
  const [reason, setReason] = useState("");
  const [existingReceiptId, setExistingReceiptId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const proofFileId = review.proof_file_id ?? null;
  const [proof, setProof] = useState<ProofState>(
    proofFileId ? { status: "loading" } : { status: "error", message: "No proof image was uploaded." }
  );

  useEffect(() => {
    if (!proofFileId) return;
    let cancelled = false;
    void getTransferProofUrl(proofFileId, { isCouncilView: true }).then((res) => {
      if (cancelled) return;
      setProof(res.success ? { status: "ready", url: res.url } : { status: "error", message: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [proofFileId]);

  const amountLabel = formatPhp(Number(review.amount));
  const hasReceipts = review.existingReceipts.length > 0;
  const needsReason = mode !== null && mode !== "received";
  const needsReceivedAt = mode === "received" || mode === "returned";

  // Any edit starts a new attempt; unchanged retries replay with the same key so they stay safe.
  function edit(apply: () => void) {
    setError(null);
    setRequestKey(null);
    apply();
  }

  function selectMode(next: DecisionMode) {
    edit(() => {
      setMode(next);
      setConfirmed(false);
      if ((next === "received" || next === "returned") && !receivedAtInput) {
        setReceivedAtInput(isoToManilaInput(new Date().toISOString()));
      }
      if (next === "returned" && !refundedAtInput) {
        setRefundedAtInput(isoToManilaInput(new Date().toISOString()));
      }
    });
  }

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  function toIso(value: string): string | undefined {
    try {
      return manilaInputToIso(value) ?? undefined;
    } catch {
      return undefined;
    }
  }

  function handleSubmit() {
    setError(null);
    if (!mode) {
      setError("Choose a decision.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that you checked the actual receipt of funds.");
      return;
    }

    const base = {
      paymentId: review.id,
      requestKey: requestKey ?? crypto.randomUUID(),
      factsConfirmed: true as const,
    };
    if (!requestKey) setRequestKey(base.requestKey);

    const receivedAt = toIso(receivedAtInput);
    const refundedAt = toIso(refundedAtInput);
    let input: TransferDecisionInput;
    if (mode === "received") {
      if (!receivedAt) return setError("Enter when the money was received.");
      input = { ...base, mode, receivedAt };
    } else if (mode === "no_receipt") {
      input = { ...base, mode, reason };
    } else if (mode === "duplicate") {
      if (!existingReceiptId) return setError("Select the existing receipt.");
      input = { ...base, mode, reason, existingReceiptId };
    } else {
      if (!receivedAt) return setError("Enter when the money was received.");
      if (!refundedAt) return setError("Enter when the money was returned.");
      input = { ...base, mode, reason, receivedAt, refundedAt };
    }

    startTransition(async () => {
      const res = await decideTransfer(input);
      if (!res.success) {
        setError(res.error);
        // Nothing was committed (validation or a rolled-back RPC), so the next attempt can use a new key.
        if (res.issues || res.retryWithNewKey) setRequestKey(null);
        return;
      }
      setDoneMessage(res.message);
    });
  }

  const fieldClass = "min-h-11 text-base md:text-sm";
  const nowInput = isoToManilaInput(new Date().toISOString());

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto p-5 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{doneMessage ? "Decision recorded" : "Review transfer"}</DialogTitle>
          <DialogDescription>
            {review.student.fullName}
            {review.student.universityId ? ` · ${review.student.universityId}` : ""} · {amountLabel}
          </DialogDescription>
        </DialogHeader>

        {doneMessage ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
              <CheckCircle2 className="size-8 text-emerald-600" />
              <p className="text-sm font-medium text-foreground">{doneMessage}</p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleClose} className="min-h-11">
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <section aria-label="Transfer details" className="space-y-3 rounded-xl border border-border bg-card p-4">
                <dl className="space-y-2 text-sm">
                  {[
                    ["Reference", review.reference_number ?? "—", true],
                    ["Sent to", `${review.destination_label} · ${review.destination_account_name}`, false],
                    ["Account", review.destination_account_reference ?? "—", true],
                    ["Submitted", formatPhDate(review.submitted_at), false],
                  ].map(([label, value, mono]) => (
                    <div key={label as string} className="grid grid-cols-[6rem_1fr] gap-2">
                      <dt className="text-xs text-muted-foreground">{label as string}</dt>
                      <dd className={cn("min-w-0 break-words text-foreground", mono && "break-all font-mono text-xs")}>
                        {value as string}
                      </dd>
                    </div>
                  ))}
                </dl>
                <ul className="space-y-1 border-t border-border pt-3 text-sm">
                  {review.items.map((item) => (
                    <li key={item.obligation_id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words text-foreground">{item.description}</span>
                      <span className="shrink-0 text-xs tabular-nums text-foreground">{formatPhp(Number(item.amount))}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <span className="text-sm font-medium text-foreground">Total</span>
                  <span className="font-heading text-xl font-semibold tabular-nums text-foreground">{amountLabel}</span>
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

              <fieldset className="min-w-0 space-y-2" disabled={isPending}>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  Check that the money actually arrived, then decide
                </legend>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {MODES.map((value) => {
                    const disabled = value === "duplicate" && !hasReceipts;
                    return (
                      <label
                        key={value}
                        className={cn(
                          "flex min-h-14 items-start gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0",
                          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40",
                          mode === value && "bg-primary/5"
                        )}
                      >
                        <input
                          type="radio"
                          name="transfer-decision"
                          checked={mode === value}
                          disabled={disabled}
                          onChange={() => selectMode(value)}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{MODE_LABELS[value].title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {disabled ? "This student has no recorded receipt to link." : MODE_LABELS[value].hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {mode && (
                <div className="space-y-3">
                  {mode === "duplicate" && (
                    <div className="space-y-2">
                      <label htmlFor={receiptSelectId} className="block text-sm font-medium text-foreground">
                        Existing receipt
                      </label>
                      <select
                        id={receiptSelectId}
                        value={existingReceiptId}
                        disabled={isPending}
                        onChange={(e) => edit(() => setExistingReceiptId(e.target.value))}
                        className={cn(
                          "w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                          fieldClass
                        )}
                      >
                        <option value="">Select a receipt…</option>
                        {review.existingReceipts.map((r) => (
                          <option key={r.receipt_id} value={r.receipt_id}>
                            {formatPhp(Number(r.amount))} · {r.method}
                            {r.reference_number ? ` · ref ${r.reference_number}` : ""}
                            {r.received_at ? ` · ${formatPhDate(r.received_at)}` : ""}
                            {r.is_refunded ? " · refunded" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {needsReceivedAt && (
                    <div className="space-y-2">
                      <label htmlFor={receivedAtId} className="block text-sm font-medium text-foreground">
                        Actual receipt date &amp; time (Asia/Manila)
                      </label>
                      <Input
                        id={receivedAtId}
                        type="datetime-local"
                        value={receivedAtInput}
                        max={nowInput}
                        disabled={isPending}
                        onChange={(e) => edit(() => setReceivedAtInput(e.target.value))}
                        className={fieldClass}
                      />
                      <p className="text-xs text-muted-foreground">When the money reached the account. Not in the future.</p>
                    </div>
                  )}

                  {mode === "returned" && (
                    <div className="space-y-2">
                      <label htmlFor={refundedAtId} className="block text-sm font-medium text-foreground">
                        Date &amp; time returned (Asia/Manila)
                      </label>
                      <Input
                        id={refundedAtId}
                        type="datetime-local"
                        value={refundedAtInput}
                        min={receivedAtInput || undefined}
                        max={nowInput}
                        disabled={isPending}
                        onChange={(e) => edit(() => setRefundedAtInput(e.target.value))}
                        className={fieldClass}
                      />
                    </div>
                  )}

                  {needsReason && (
                    <div className="space-y-2">
                      <label htmlFor={reasonId} className="block text-sm font-medium text-foreground">
                        Reason
                      </label>
                      <Input
                        id={reasonId}
                        value={reason}
                        maxLength={500}
                        disabled={isPending}
                        onChange={(e) => edit(() => setReason(e.target.value))}
                        placeholder="Short note for the record"
                        className={fieldClass}
                      />
                    </div>
                  )}

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
                      checked={confirmed}
                      disabled={isPending}
                      onChange={(e) => edit(() => setConfirmed(e.target.checked))}
                      className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                    />
                    <span className="text-xs leading-relaxed text-foreground">{MODE_LABELS[mode].confirm(amountLabel)}</span>
                  </label>
                </div>
              )}
            </div>

            <section
              aria-label="Receipt image"
              className="flex min-h-48 min-w-0 items-center justify-center rounded-xl border border-border bg-muted/20 p-3"
            >
              {proof.status === "loading" ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <span>Loading receipt image…</span>
                </div>
              ) : proof.status === "error" ? (
                <p className="text-center text-sm text-destructive">{proof.message}</p>
              ) : (
                <a href={proof.url} target="_blank" rel="noreferrer" className="block" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proof.url}
                    alt="Submitted transfer receipt"
                    className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg border border-border bg-background object-contain"
                  />
                </a>
              )}
            </section>
          </div>
        )}

        {!doneMessage && (
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending} className="min-h-11">
              Cancel
            </Button>
            <Button
              type="button"
              variant={mode && mode !== "received" ? "destructive" : "default"}
              onClick={handleSubmit}
              disabled={isPending || !mode || !confirmed}
              className="min-h-11"
            >
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isPending ? "Saving…" : mode === "received" ? "Verify transfer" : "Reject transfer"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
