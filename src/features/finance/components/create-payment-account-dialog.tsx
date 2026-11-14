"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPaymentAccount } from "../actions";
import {
  PaymentAccountFormFields,
  prepareAndUploadPaymentAccountQr,
  validatePaymentAccountFields,
  type PaymentAccountFormValues,
} from "./payment-account-form-fields";

const emptyFormValues: PaymentAccountFormValues = {
  label: "",
  accountName: "",
  accountReference: "",
  qrFile: null,
  removeExistingQr: false,
};

export function CreatePaymentAccountDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState<PaymentAccountFormValues>(emptyFormValues);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setError(null);
    setValues(emptyFormValues);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validatePaymentAccountFields(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      let qrFileId: string | undefined = undefined;
      if (values.qrFile) {
        const uploadRes = await prepareAndUploadPaymentAccountQr(values.qrFile);
        if (!uploadRes.success) {
          setError(uploadRes.error);
          return;
        }
        qrFileId = uploadRes.fileId;
      }

      const result = await createPaymentAccount({
        label: values.label.trim(),
        accountName: values.accountName.trim(),
        accountReference: values.accountReference.trim(),
        qrFileId,
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
          <DialogTitle>Add Payment Account</DialogTitle>
          <DialogDescription>
            Configure a transfer destination used for student payments.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <PaymentAccountFormFields
            idPrefix="create-account"
            values={values}
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
              Save Account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
