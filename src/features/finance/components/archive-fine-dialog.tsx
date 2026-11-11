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
import { archiveFineDefinition } from "../actions";
import type { FineDefinitionDTO } from "../contracts";

export function ArchiveFineDialog({
  definition,
  isOpen,
  onClose,
}: {
  definition: FineDefinitionDTO | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    if (!definition) return;
    setError(null);

    startTransition(async () => {
      const result = await archiveFineDefinition({ id: definition.id });
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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            Archive Fine Definition
          </DialogTitle>
          <DialogDescription>
            Retire this fine definition from future event consequence choices.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Are you sure you want to archive{" "}
            <strong className="text-foreground font-semibold">&ldquo;{definition?.name}&rdquo;</strong>{" "}
            (₱{definition ? definition.amount.toFixed(2) : "0.00"})?
          </p>

          <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border">
            Archiving removes this fine from future event consequence choices. Existing event
            consequence rules and past student obligations will remain completely preserved.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
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
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Confirm Archive
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
