"use client";

import { useState, useTransition } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";

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

    if (!isOpen || !definition) return null;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                    <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="size-5" />
                        <h2 className="text-lg font-semibold text-foreground">Archive Fine Definition</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-5" />
                        <span className="sr-only">Close</span>
                    </button>
                </div>

                <div className="mt-4 flex flex-col gap-4">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                            {error}
                        </div>
                    )}

                    <p className="text-sm text-muted-foreground">
                        Are you sure you want to archive{" "}
                        <strong className="text-foreground font-semibold">&ldquo;{definition.name}&rdquo;</strong>{" "}
                        (₱{definition.amount.toFixed(2)})?
                    </p>

                    <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border">
                        Archiving removes this fine from future event consequence choices. Existing event
                        consequence rules and past student obligations will remain completely preserved.
                    </p>

                    <div className="mt-2 flex items-center justify-end gap-2 pt-2 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleArchive}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                        >
                            {isPending && <Loader2 className="size-4 animate-spin" />}
                            Confirm Archive
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

