"use client";

import { useState, useTransition } from "react";
import { X, Loader2 } from "lucide-react";

import { createFineDefinition } from "../actions";

export function CreateFineDialog({
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

    if (!isOpen) return null;

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
            const result = await createFineDefinition({
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">Create Fine Definition</h2>
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

                    <div>
                        <label htmlFor="fine-name" className="block text-sm font-medium text-foreground mb-1">
                            Fine Name
                        </label>
                        <input
                            id="fine-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Late Attendance - Assembly"
                            disabled={isPending}
                            required
                            maxLength={100}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label htmlFor="fine-amount" className="block text-sm font-medium text-foreground mb-1">
                            Amount (PHP)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-sm text-muted-foreground">₱</span>
                            <input
                                id="fine-amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="50.00"
                                disabled={isPending}
                                required
                                className="w-full rounded-lg border border-input bg-background pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                            />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Reusable default penalty for future event consequence configurations.
                        </p>
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
                            Create Fine
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

