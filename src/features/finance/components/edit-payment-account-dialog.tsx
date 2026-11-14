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
import { updatePaymentAccount } from "../actions";
import type { PaymentAccountDTO } from "../contracts";
import {
  PaymentAccountFormFields,
  prepareAndUploadPaymentAccountQr,
  validatePaymentAccountFields,
  type PaymentAccountFormValues,
} from "./payment-account-form-fields";

export function EditPaymentAccountDialog({
  account,
  isOpen,
  onClose,
}: {
  account: PaymentAccountDTO | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState<PaymentAccountFormValues>(() => ({
    label: account?.label ?? "",
    accountName: account?.account_name ?? "",
    accountReference: account?.account_reference ?? "",
    qrFile: null,
    removeExistingQr: false,
  }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);

    const validationError = validatePaymentAccountFields(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      let finalQrFileId: string | null | undefined = values.removeExistingQr
        ? null
        : account.qr_file_id;

      if (values.qrFile) {
        const uploadRes = await prepareAndUploadPaymentAccountQr(values.qrFile);
        if (!uploadRes.success) {
          setError(uploadRes.error);
          return;
        }
        finalQrFileId = uploadRes.fileId;
      }

      const result = await updatePaymentAccount({
        id: account.id,
        label: values.label.trim(),
        accountName: values.accountName.trim(),
        accountReference: values.accountReference.trim(),
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
            Update destination details for future submissions.
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

          <PaymentAccountFormFields
            idPrefix="edit-account"
            values={values}
            existingQrFileId={account?.qr_file_id}
            disabled={isPending}
            error={error}
            onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
            onError={setError}
          />

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
