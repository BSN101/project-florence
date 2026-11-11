"use client";

import { useState, useTransition, useEffect } from "react";
import { X, Loader2, Info } from "lucide-react";

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

    if (!isOpen || !definition) return null;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">Edit Fine Definition</h2>
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

                <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                            {error}
                        </div>
                    )}

                    {/* Institutional advisory alert explaining the future-use core invariant */}
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
                        <input
                            id="edit-fine-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isPending}
                            required
                            maxLength={100}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label htmlFor="edit-fine-amount" className="block text-sm font-medium text-foreground mb-1">
                            Amount (PHP)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-sm text-muted-foreground">₱</span>
                            <input
                                id="edit-fine-amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                disabled={isPending}
                                required
                                className="w-full rounded-lg border border-input bg-background pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {isPending && <Loader2 className="size-4 animate-spin" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

