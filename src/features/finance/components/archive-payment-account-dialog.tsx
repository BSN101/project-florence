"use client";

import { useState, useTransition } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archivePaymentAccount } from "../actions";
import type { PaymentAccountDTO } from "../contracts";

export function ArchivePaymentAccountDialog({
  account,
  isOpen,
  onClose,
}: {
  account: PaymentAccountDTO | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setError(null);
    onClose();
  }

  function handleArchive() {
    if (!account) return;
    setError(null);

    startTransition(async () => {
      const result = await archivePaymentAccount({ id: account.id });
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
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            Archive Payment Account
          </DialogTitle>
          <DialogDescription>
            Retire this destination account from future student submissions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <p className="text-sm text-foreground">
            Are you sure you want to archive{" "}
            <span className="font-semibold text-foreground">
              {account?.label} ({account?.account_name})
            </span>
            ?
          </p>

          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground border border-border space-y-1">
            <p>
              • This account will no longer be available for new student transfer submissions.
            </p>
            <p>
              • Existing payment submissions remain valid and retain their destination details.
            </p>
            <p>• Accounts are archived rather than deleted to protect audit history.</p>
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
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Archive Account
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
