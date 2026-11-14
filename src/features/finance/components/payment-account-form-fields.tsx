"use client";

import { Trash2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compressImage, MAX_ORIGINAL_BYTES } from "@/lib/compress-image";
import { uploadPaymentAccountQr } from "../actions";
import { createPaymentAccountSchema, PAYMENT_ACCOUNT_QR_MAX_BYTES } from "../schemas";

export type PaymentAccountFormValues = {
  label: string;
  accountName: string;
  accountReference: string;
  qrFile: File | null;
  removeExistingQr: boolean;
};

export function validatePaymentAccountFields(values: {
  label: string;
  accountName: string;
  accountReference: string;
}): string | null {
  if (!values.label.trim()) {
    return "Please provide a destination label (e.g. GCash, Landbank).";
  }
  if (!values.accountName.trim()) {
    return "Please provide the account holder name.";
  }
  if (!values.accountReference.trim()) {
    return "Please provide the account number.";
  }
  const accountNumber = createPaymentAccountSchema.shape.accountReference.safeParse(values.accountReference);
  if (!accountNumber.success) {
    return accountNumber.error.issues[0]?.message ?? "Please provide a valid account number.";
  }
  return null;
}

export async function prepareAndUploadPaymentAccountQr(
  file: File
): Promise<{ success: true; fileId: string } | { success: false; error: string }> {
  try {
    const compressed = await compressImage(file, "payment_account_qr");
    if (compressed.size > PAYMENT_ACCOUNT_QR_MAX_BYTES) {
      return {
        success: false,
        error: "The QR code image is still larger than 2 MB after compression. Try a smaller image.",
      };
    }
    const formData = new FormData();
    formData.append("file", compressed);
    return await uploadPaymentAccountQr(formData);
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not process the QR code image. Try another file.",
    };
  }
}

export function PaymentAccountFormFields({
  idPrefix,
  values,
  existingQrFileId,
  disabled,
  error,
  onChange,
  onError,
}: {
  idPrefix: string;
  values: PaymentAccountFormValues;
  existingQrFileId?: string | null;
  disabled: boolean;
  error: string | null;
  onChange: (patch: Partial<PaymentAccountFormValues>) => void;
  onError: (message: string | null) => void;
}) {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    onError(null);
    const selected = e.target.files?.[0] ?? null;
    if (!selected) {
      onChange({ qrFile: null });
      return;
    }
    if (!selected.type.startsWith("image/")) {
      onError("Please select a valid image file (PNG, JPEG, or WebP).");
      onChange({ qrFile: null });
      e.target.value = "";
      return;
    }
    if (selected.size === 0) {
      onError("The selected file is empty.");
      onChange({ qrFile: null });
      e.target.value = "";
      return;
    }
    if (selected.size > MAX_ORIGINAL_BYTES) {
      onError("The image is larger than 15 MB. Please choose a smaller file.");
      onChange({ qrFile: null });
      e.target.value = "";
      return;
    }
    onChange({ qrFile: selected, removeExistingQr: false });
  }

  const hasCurrentQr = Boolean(existingQrFileId) && !values.removeExistingQr && !values.qrFile;

  return (
    <>
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor={`${idPrefix}-label`}
          className="block text-sm font-medium text-foreground mb-1"
        >
          Destination Label
        </label>
        <Input
          id={`${idPrefix}-label`}
          type="text"
          value={values.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. GCash - Council Treasury"
          disabled={disabled}
          required
          maxLength={100}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-name`}
          className="block text-sm font-medium text-foreground mb-1"
        >
          Account Holder Name
        </label>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          value={values.accountName}
          onChange={(e) => onChange({ accountName: e.target.value })}
          placeholder="e.g. Nursing Student Council"
          disabled={disabled}
          required
          maxLength={100}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-reference`}
          className="block text-sm font-medium text-foreground mb-1"
        >
          Account Number
        </label>
        <Input
          id={`${idPrefix}-reference`}
          type="text"
          value={values.accountReference}
          onChange={(e) => onChange({ accountReference: e.target.value })}
          placeholder="e.g. 0917-123-4567 or 1234-5678-90"
          disabled={disabled}
          required
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={`${idPrefix}-qr`}
            className="block text-sm font-medium text-foreground"
          >
            QR Code Image (Optional)
          </label>
          {existingQrFileId && !values.qrFile && (
            values.removeExistingQr ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange({ removeExistingQr: false })}
                className="h-auto px-2 py-0.5 text-xs gap-1"
              >
                <RotateCcw className="size-3" />
                Keep current QR
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange({ removeExistingQr: true })}
                className="h-auto px-2 py-0.5 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3" />
                Remove QR
              </Button>
            )
          )}
        </div>
        <Input
          id={`${idPrefix}-qr`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={disabled}
          className="cursor-pointer file:cursor-pointer"
        />
        <p className="text-[11px] text-muted-foreground">
          {values.removeExistingQr
            ? "Current QR code will be removed when you save changes."
            : hasCurrentQr
            ? "A QR code is currently attached. Select a file to replace it, or click Remove QR."
            : "PNG, JPEG, or WebP (automatically resized on upload, max 2 MB stored)."}
        </p>
      </div>
    </>
  );
}
