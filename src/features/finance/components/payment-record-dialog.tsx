"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";

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
import { getTransferProofUrl } from "../actions";
import type { PaymentHistoryDTO } from "../contracts";
import { describePaymentRecord, type PaymentRecordTone } from "../payment-record";
import { renderPaymentRecordImage, savePaymentRecordImage } from "../payment-record-image";

const toneClass: Record<PaymentRecordTone, string> = {
  pending: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  verified: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  refunded: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  superseded: "bg-muted text-muted-foreground border-border",
};

type Loaded<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error"; message: string };

/**
 * Payment record beside its receipt image (FL-022/FL-023). Shared by the student and
 * Council views; `actions` is where Council decisions go (T-036). Students can save the
 * record and receipt image as one photo.
 */
export function PaymentRecordDialog({
  payment,
  onClose,
  isCouncilView = false,
  studentLabel,
  actions,
}: {
  payment: PaymentHistoryDTO;
  onClose: () => void;
  isCouncilView?: boolean;
  studentLabel?: string;
  actions?: ReactNode;
}) {
  const view = describePaymentRecord(payment, studentLabel);
  const proofFileId = payment.proof_file_id ?? null;
  const [proof, setProof] = useState<Loaded<string>>({ status: "loading" });
  const [photo, setPhoto] = useState<Loaded<Blob>>({ status: "loading" });
  const [isSaving, setIsSaving] = useState(false);
  const canSavePhoto = !isCouncilView && Boolean(proofFileId);

  useEffect(() => {
    if (!proofFileId) return;
    let cancelled = false;
    void getTransferProofUrl(proofFileId, { isCouncilView }).then((res) => {
      if (cancelled) return;
      setProof(res.success ? { status: "ready", value: res.url } : { status: "error", message: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [proofFileId, isCouncilView]);

  // Built ahead of the tap: iOS only opens the share sheet straight from a user gesture.
  useEffect(() => {
    if (!canSavePhoto || !proofFileId) return;
    let cancelled = false;
    renderPaymentRecordImage(describePaymentRecord(payment, studentLabel), proofFileId).then(
      (blob) => !cancelled && setPhoto({ status: "ready", value: blob }),
      (error: unknown) =>
        !cancelled &&
        setPhoto({
          status: "error",
          message: error instanceof Error ? error.message : "The photo could not be created.",
        })
    );
    return () => {
      cancelled = true;
    };
  }, [canSavePhoto, proofFileId, payment, studentLabel]);

  async function handleSavePhoto() {
    if (photo.status !== "ready") return;
    setIsSaving(true);
    try {
      await savePaymentRecordImage(photo.value, `florence-payment-${payment.submitted_at.slice(0, 10)}.png`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto p-5 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{view.title}</DialogTitle>
          <DialogDescription>
            {payment.reference_number ? `Ref ${payment.reference_number} · ` : ""}
            {view.total}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {/* Record */}
          <section aria-label="Payment details" className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="space-y-2">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  toneClass[view.status.tone]
                )}
              >
                {view.status.label}
              </span>
              {view.notice && <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">{view.notice}</p>}
            </div>

            <dl className="space-y-2 border-t border-border pt-3 text-sm">
              {view.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className={cn("min-w-0 break-words text-foreground", row.mono && "break-all font-mono text-xs")}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            {view.items.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">Covered items</div>
                <ul className="space-y-1 text-sm">
                  {view.items.map((item, i) => (
                    <li key={`${item.label}-${i}`} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words text-foreground">{item.label}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{item.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="font-heading text-xl font-semibold tabular-nums text-foreground">{view.total}</span>
            </div>
          </section>

          {/* Receipt image */}
          <section
            aria-label="Receipt image"
            className="flex min-h-48 min-w-0 items-center justify-center rounded-xl border border-border bg-muted/20 p-3"
          >
            {!proofFileId ? (
              <p className="text-sm text-muted-foreground">No receipt image for this record.</p>
            ) : proof.status === "loading" ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span>Loading receipt image…</span>
              </div>
            ) : proof.status === "error" ? (
              <p className="text-center text-sm text-destructive">{proof.message}</p>
            ) : (
              <a href={proof.value} target="_blank" rel="noreferrer" className="block" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proof.value}
                  alt="Submitted transfer receipt"
                  className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg border border-border bg-background object-contain"
                />
              </a>
            )}
          </section>
        </div>

        {photo.status === "error" && canSavePhoto && (
          <p role="alert" className="text-xs text-destructive">
            {photo.message}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="min-h-11">
            Close
          </Button>
          {canSavePhoto && (
            <Button
              type="button"
              onClick={() => void handleSavePhoto()}
              disabled={photo.status !== "ready" || isSaving}
              className="min-h-11 gap-2"
            >
              {photo.status === "loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {photo.status === "loading" ? "Preparing photo…" : "Save as photo"}
            </Button>
          )}
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
