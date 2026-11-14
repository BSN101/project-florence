"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { buttonClass } from "./auth-shell";

// Stays pending through the action's redirect, so the click visibly registers and cannot double-submit.
export function SubmitButton({ children, pendingLabel, className = "" }: { children: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${buttonClass} gap-2 disabled:cursor-wait disabled:opacity-70 ${className}`} type="submit" disabled={pending} aria-busy={pending}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
