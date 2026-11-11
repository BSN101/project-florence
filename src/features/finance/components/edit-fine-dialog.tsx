"use client";

import { useState, useTransition, useEffect } from "react";
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
import { updateFineDefinition } from "../actions";
import type { FineDefinitionDTO } from "../contracts";

export function EditFineDialog({
  definition,
  isOpen,
  onClose,
}: {
  definition: FineDefinitionDTO | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (definition) {
      setName(definition.name);
      setAmount(definition.amount.toString());
      setError(null);
    }
  }, [definition]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numericAmount = parseFloat(amount);
    if (!name.trim()) {
      setError("Please provide a fine name.");
      return;
    }
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError("Please provide a positive amount greater than zero.");
      return;
    }

    startTransition(async () => {
      if (!definition) return;
      const result = await updateFineDefinition({
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Fine Definition</DialogTitle>
          <DialogDescription>
            Update the fine name or default amount for future event consequence configurations.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary mt-0.5" />
            <p>
              <strong className="text-foreground">Future-use notice:</strong> Editing this fine
              definition will only affect future event consequence configurations. Previously frozen
              event rules and already generated student obligations will not be altered.
            </p>
          </div>

          <div>
            <label htmlFor="edit-fine-name" className="block text-sm font-medium text-foreground mb-1">
              Fine Name
            </label>
            <Input
              id="edit-fine-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Late Attendance - Assembly"
              disabled={isPending}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="edit-fine-amount" className="block text-sm font-medium text-foreground mb-1">
              Amount (PHP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-muted-foreground">₱</span>
              <Input
                id="edit-fine-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
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
      </DialogContent>
    </Dialog>
  );
}
