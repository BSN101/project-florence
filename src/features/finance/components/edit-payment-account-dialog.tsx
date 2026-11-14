"use client";

import { useState, useTransition } from "react";
import { Loader2, Info } from "lucide-react";

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
import { updatePaymentAccount, uploadPaymentAccountQr } from "../actions";
import type { PaymentAccountDTO } from "../contracts";

export function EditPaymentAccountDialog({
  account,
  isOpen,
  onClose,
}: {
  account: PaymentAccountDTO | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(account?.label ?? "");
  const [accountName, setAccountName] = useState(account?.account_name ?? "");
  const [accountReference, setAccountReference] = useState(account?.account_reference ?? "");
  const [instructions, setInstructions] = useState(account?.instructions ?? "");
  const [qrFileId] = useState<string | null>(account?.qr_file_id ?? null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setError(null);
    setQrFile(null);
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = e.target.files?.[0] ?? null;
    if (!selected) {
      setQrFile(null);
      return;
    }
    if (!selected.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPEG, or WebP).");
      setQrFile(null);
      e.target.value = "";
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      setError("The QR code file must be smaller than 2 MB.");
      setQrFile(null);
      e.target.value = "";
      return;
    }
    setQrFile(selected);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);

    if (!label.trim()) {
      setError("Please provide a destination label.");
      return;
    }
    if (!accountName.trim()) {
      setError("Please provide the account holder name.");
      return;
    }
    if (!accountReference.trim()) {
      setError("Please provide the account or reference number.");
      return;
    }

    startTransition(async () => {
      let finalQrFileId: string | null | undefined = qrFileId;
      if (qrFile) {
        const formData = new FormData();
        formData.append("file", qrFile);
        const uploadRes = await uploadPaymentAccountQr(formData);
        if (!uploadRes.success) {
          setError(uploadRes.error);
          return;
        }
        finalQrFileId = uploadRes.fileId;
      }

      const result = await updatePaymentAccount({
        id: account.id,
        label: label.trim(),
        accountName: accountName.trim(),
        accountReference: accountReference.trim(),
        instructions: instructions.trim() || undefined,
        qrFileId: finalQrFileId,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      handleClose();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) handleClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Payment Account</DialogTitle>
          <DialogDescription>
            Update destination details and instructions for future submissions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground border border-border">
            <Info className="size-4 shrink-0 text-primary mt-0.5" />
            <p>
              Modifications apply to future student submissions only. Existing
              submissions retain their original point-in-time snapshot.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="edit-account-label"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Destination Label
            </label>
            <Input
              id="edit-account-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label
              htmlFor="edit-account-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Account Holder Name
            </label>
            <Input
              id="edit-account-name"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label
              htmlFor="edit-account-reference"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Account / Reference Number
            </label>
            <Input
              id="edit-account-reference"
              type="text"
              value={accountReference}
              onChange={(e) => setAccountReference(e.target.value)}
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label
              htmlFor="edit-account-instructions"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Transfer Instructions (Optional)
            </label>
            <textarea
              id="edit-account-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={isPending}
              maxLength={1000}
              rows={3}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-right text-[11px] text-muted-foreground mt-0.5">
              {instructions.length}/1000
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-account-qr"
              className="block text-sm font-medium text-foreground mb-1"
            >
              QR Code Image (Optional)
            </label>
            <Input
              id="edit-account-qr"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              disabled={isPending}
              className="cursor-pointer file:cursor-pointer"
            />
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {qrFileId
                ? "A QR code is currently attached. Select a new file to replace it."
                : "Attach a QR code image (PNG, JPEG, or WebP up to 2 MB)."}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
