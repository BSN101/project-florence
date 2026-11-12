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
import { createFeeDefinition } from "../actions";

export function CreateFeeDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numericAmount = parseFloat(amount);
    if (!name.trim()) {
      setError("Please provide a fee name.");
      return;
    }
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError("Please provide a positive amount greater than zero.");
      return;
    }

    startTransition(async () => {
      const result = await createFeeDefinition({
        name: name.trim(),
        amount: numericAmount,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setName("");
      setAmount("");
      onClose();
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Fee Definition</DialogTitle>
          <DialogDescription>
            Configure a reusable fee that can be published to students each semester.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="fee-name" className="block text-sm font-medium text-foreground mb-1">
              Fee Name
            </label>
            <Input
              id="fee-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Council Membership Fee"
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="fee-amount" className="block text-sm font-medium text-foreground mb-1">
              Amount (PHP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-muted-foreground">₱</span>
              <Input
                id="fee-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150.00"
                disabled={isPending}
                required
                className="pl-7"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Default amount used when this fee is published in a future semester.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Create Fee
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

