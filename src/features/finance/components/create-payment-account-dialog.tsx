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
import { Input } from "@/components/ui/input";
import { createPaymentAccount } from "../actions";

export function CreatePaymentAccountDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountReference, setAccountReference] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!label.trim()) {
      setError("Please provide a destination label (e.g. GCash, Landbank).");
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
      const result = await createPaymentAccount({
        label: label.trim(),
        accountName: accountName.trim(),
        accountReference: accountReference.trim(),
        instructions: instructions.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setLabel("");
      setAccountName("");
      setAccountReference("");
      setInstructions("");
      onClose();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payment Account</DialogTitle>
          <DialogDescription>
            Configure a transfer destination and instructions used for student payments.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="account-label"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Destination Label
            </label>
            <Input
              id="account-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. GCash - Council Treasury"
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label
              htmlFor="account-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Account Holder Name
            </label>
            <Input
              id="account-name"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Nursing Student Council"
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label
              htmlFor="account-reference"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Account / Reference Number
            </label>
            <Input
              id="account-reference"
              type="text"
              value={accountReference}
              onChange={(e) => setAccountReference(e.target.value)}
              placeholder="e.g. 0917-123-4567 or 1234-5678-90"
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label
              htmlFor="account-instructions"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Transfer Instructions (Optional)
            </label>
            <textarea
              id="account-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Please put your Student Number in the message or remarks."
              disabled={isPending}
              maxLength={1000}
              rows={3}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-right text-[11px] text-muted-foreground mt-0.5">
              {instructions.length}/1000
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
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
