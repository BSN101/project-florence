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
import { updateFeeDefinition } from "../actions";
import type { FeeDefinitionDTO } from "../contracts";

export function EditFeeDialog({
  definition,
  isOpen,
  onClose,
}: {
  definition: FeeDefinitionDTO | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Fee Definition</DialogTitle>
          <DialogDescription>
            Update the fee name or default amount for future fee publications.
          </DialogDescription>
        </DialogHeader>

        {definition && (
          <EditFeeForm
            key={definition.id}
            definition={definition}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditFeeForm({
  definition,
  onClose,
}: {
  definition: FeeDefinitionDTO;
  onClose: () => void;
}) {
  const [name, setName] = useState(definition.name);
  const [amount, setAmount] = useState(definition.amount.toString());
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
      const result = await updateFeeDefinition({
        id: definition.id,
        name: name.trim(),
        amount: numericAmount,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 text-primary mt-0.5" />
        <p>
          <strong className="text-foreground">Future-use notice:</strong> Changes apply only to
          future fee publications. Fees already published and existing student obligations keep
          their original name and amount.
        </p>
      </div>

      <div>
        <label htmlFor="edit-fee-name" className="block text-sm font-medium text-foreground mb-1">
          Fee Name
        </label>
        <Input
          id="edit-fee-name"
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
        <label htmlFor="edit-fee-amount" className="block text-sm font-medium text-foreground mb-1">
          Amount (PHP)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-sm text-muted-foreground">₱</span>
          <Input
            id="edit-fee-amount"
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
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}

